import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { MapConfigController } from "./map-config.controller";
import { AddressSearch, AddressSearchController } from "./address-search";

@Module({
  controllers: [AppController, MapConfigController, AddressSearchController],
  providers: [AddressSearch],
})
export class AppModule {}
