import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { MapConfigController } from "./map-config.controller";

@Module({ controllers: [AppController, MapConfigController] })
export class AppModule {}
