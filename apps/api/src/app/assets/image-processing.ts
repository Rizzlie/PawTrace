import {
  HttpException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { opendir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Environment } from '../environment';
import { type AssetMetadata } from './asset-metadata';
import { OriginalAssets } from './original-assets';

const kinds = ['thumbnail', 'preview'] as const;
type Kind = (typeof kinds)[number];
const workerResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    peakRssKiB: z.number().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.enum([
      'decoder_failed',
      'decoder_resource_limit',
      'derivative_write_failed',
      'worker_exited',
      'processing_timeout',
    ]),
  }),
]);
type Result = z.infer<typeof workerResult>;

/** Disk metadata is the queue. One scan, one asset, one child at a time; no in-memory backlog. */
@Injectable()
export class ImageProcessing implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly root: string;
  private readonly timeout: number;
  private readonly worker: string;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private child?: ChildProcess;
  private stopping = false;
  private active?: string;
  private readonly retrying = new Set<string>();
  private readonly logger = new Logger(ImageProcessing.name);

  constructor(
    config: ConfigService<Environment, true>,
    private readonly originals: OriginalAssets,
  ) {
    this.root = resolve(config.get('ASSET_DIRECTORY', { infer: true }));
    this.timeout = config.get('IMAGE_PROCESSING_TIMEOUT_MS', { infer: true });
    this.worker =
      [
        join(__dirname, 'assets/image-worker.mjs'),
        join(__dirname, '../../assets/image-worker.mjs'),
      ].find((path) => existsSync(path)) ?? join(__dirname, 'assets/image-worker.mjs');
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopping) {
        this.running = this.scan()
          .catch(() => {
            this.logger.warn(
              'Photo queue scan or metadata write unavailable; pending work will be retried.',
            );
          })
          .finally(() => {
            this.running = undefined;
          });
      }
    }, 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.child?.kill('SIGKILL');
    await this.running;
  }

  async retry(filename: string): Promise<AssetMetadata> {
    if (this.active === filename || this.retrying.has(filename))
      return this.originals.metadata(filename);
    this.retrying.add(filename);
    try {
      const metadata = await this.originals.metadata(filename);
      if (!kinds.some((kind) => metadata.processing[kind].status === 'failed')) return metadata;
      for (const kind of kinds) {
        if (metadata.processing[kind].status === 'failed')
          metadata.processing[kind] = { status: 'pending' };
      }
      await this.originals.saveMetadata(metadata);
      return metadata;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Nie udało się ponowić przetwarzania zdjęcia. Ponów próbę.', 503);
    } finally {
      this.retrying.delete(filename);
    }
  }

  private async scan(): Promise<void> {
    let directories;
    try {
      directories = await opendir(this.root);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    for await (const entry of directories) {
      if (this.stopping) break;
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/u.test(entry.name)) continue;
      // Exactly one published original belongs to this directory. Unpublished uploads are ignored.
      const metadata = await this.originals.findMetadata(entry.name);
      if (!metadata || this.retrying.has(metadata.filename)) continue;
      this.active = metadata.filename;
      try {
        for (const kind of kinds) {
          if (this.stopping) break;
          if (metadata.processing[kind].status !== 'pending') continue;
          await this.process(metadata, kind);
        }
      } catch {
        this.logger.warn(
          'Photo metadata could not be published; pending work remains recoverable.',
        );
      } finally {
        this.active = undefined;
      }
    }
  }

  private async process(metadata: AssetMetadata, kind: Kind): Promise<void> {
    const directory = join(this.root, metadata.filename.slice(0, 36));
    const temporary = join(directory, `${kind}.part.png`);
    // Clean a previous interrupted attempt before admitting another decoder.
    let result: Result;
    try {
      await rm(temporary, { force: true });
      result = await this.decode(join(directory, metadata.filename), temporary, kind).catch(
        (): Result => ({ ok: false, error: 'worker_exited' }),
      );
    } catch {
      result = { ok: false, error: 'derivative_write_failed' };
    }
    if (this.stopping) return; // Preserve pending state for restart recovery.
    if (result.ok) {
      try {
        await this.originals.publishDerivative(metadata, kind, temporary);
        metadata.widthPixels = result.width;
        metadata.heightPixels = result.height;
        this.logger.log(`${kind} ready; worker peak RSS ${result.peakRssKiB} KiB.`);
      } catch {
        result = { ok: false, error: 'derivative_write_failed' };
      }
    }
    if (!result.ok) metadata.processing[kind] = { status: 'failed', error: result.error };
    await this.originals.saveMetadata(metadata);
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  private decode(input: string, output: string, kind: Kind): Promise<Result> {
    return new Promise((resolveResult) => {
      const child = fork(this.worker, [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: ['--max-old-space-size=128'],
        env: { ...process.env, MALLOC_ARENA_MAX: '2', VIPS_CONCURRENCY: '1' },
      });
      this.child = child;
      let result: Result = { ok: false, error: 'worker_exited' };
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        result = { ok: false, error: 'processing_timeout' };
        child.kill('SIGKILL');
      }, this.timeout);
      child.on('message', (message: unknown) => {
        if (timedOut) return;
        const parsed = workerResult.safeParse(message);
        if (parsed.success) result = parsed.data;
      });
      child.once('error', () => {
        result = { ok: false, error: 'worker_exited' };
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        this.child = undefined;
        if (code !== 0 && result.ok) result = { ok: false, error: 'worker_exited' };
        resolveResult(result);
      });
      child.send({ input, output, kind }, (error) => {
        if (error) child.kill('SIGKILL');
      });
    });
  }
}
