// Native decoding lives exclusively in this short-lived process, never in Nest's heap.
import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(1);

process.once('message', async ({ input, output, kind }) => {
  try {
    // No explicit page: Sharp selects the HEIF primary image, rather than its thumbnail.
    const image = sharp(input, { sequentialRead: true }).autoOrient();
    const metadata = await image.metadata();
    const dimensions = metadata.autoOrient ?? metadata;
    if (kind === 'thumbnail') {
      image.resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true });
    }
    await image
      .withIccProfile('srgb', { attach: false })
      .toColourspace('srgb')
      .png()
      .toFile(output);
    process.send?.({
      ok: true,
      width: dimensions.width,
      height: dimensions.height,
      peakRssKiB: process.resourceUsage().maxRSS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown decoder failure';
    const code = /ENOSPC|EACCES|EROFS|unable to open|write|save_target/iu.test(message)
      ? 'derivative_write_failed'
      : /memory|allocation|pixel limit|exceeds/iu.test(message)
        ? 'decoder_resource_limit'
        : 'decoder_failed';
    process.send?.({ ok: false, error: code });
  } finally {
    process.disconnect();
  }
});
