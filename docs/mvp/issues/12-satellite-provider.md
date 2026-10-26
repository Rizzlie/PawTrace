# Choosing satellite tiles for Leaflet

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

Which satellite-tile provider should we use with Leaflet under the free-MVP requirement and without assuming permission to add a payment card? The user suggested Mapbox and excluded GUGiK. Establish acceptance of an account and a limited trial, the basic-map source, and behavior after reaching the limit. Do not choose a paid plan or request a token in ordinary chat.

## Comments

Primary sources checked by the parent:

- [Mapbox + Leaflet](https://docs.mapbox.com/help/ja/dive-deeper/mapbox-in-leaflet/): native Leaflet raster layers; classic styles through Static Tiles API, including `satellite-streets-v12`. Direct `mapbox.satellite` uses the separate Raster Tiles API. A token is required.
- [Static Tiles API](https://docs.mapbox.com/api/maps/static-tiles/): Leaflet support; classic styles, but no Mapbox Standard or Mapbox Standard Satellite support. Billing is per tile, not a GL JS map load.
- [Current signup rules](https://docs.mapbox.com/accounts/guides/signup/): card-free trial, 20,000 Static Tiles API requests/month; Raster Tiles API is unavailable during the trial and unlocked by adding a payment method. Do not equate the trial with the full free tier. No specific token has been tested because the user has not yet chosen or connected an account.
- [Pricing](https://www.mapbox.com/pricing): full free allowances and paid overages depend on the product. Do not apply the GL JS allowance to Leaflet or promise 750,000 card-free Raster Tiles API requests.

Proposal for decision: basic OSM mapping and labeled `satellite-streets-v12` imagery through Static Tiles API in a card-free Mapbox trial. Requires user acceptance; technical compatibility does not replace an informed provider choice.

## Answer

The user confirmed the proposed option:

- Leaflet with a two-layer switcher: basic OSM mapping and Mapbox `satellite-streets-v12` imagery with labels.
- Mapbox through Static Tiles API, not direct Raster Tiles API. Do not use Mapbox Standard/Standard Satellite styles unsupported by this endpoint.
- A card-free trial account; the checked signup documentation includes 20,000 Static Tiles requests per month. This limits service tile requests, not users or map opens. It does not mean indefinite or unlimited free usage; terms may change and must be checked again before configuration.
- Do not assume authorization to add a payment method, incur overages, or upgrade to a full plan. If satellite imagery is unavailable or access is exhausted, retain the case and access to the basic map; display a clear message rather than automatically purchasing access.
- The required Mapbox account token remains a future implementation configuration step, not a condition for completing planning. No account was created or token obtained. When the user needs to supply one, use the private `request_secret` mechanism, not ordinary chat.
- Layer configuration respects source requirements for tile size, zoom offset, and attribution. A public browser token is not a secret administrative token; configure it and any available restrictions for the chosen account type.

Sources and billing constraints: the links in Comments. No Mapbox account connection or individual-tile testing was performed. No commits were created.
