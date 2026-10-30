import { SetMetadata } from '@nestjs/common';
export const PUBLIC_AUTH = Symbol('public-auth');
export const OWNERLESS_ASSET = Symbol('ownerless-asset');
export const NO_ACTIVITY = Symbol('no-session-activity');
export const PublicAuthentication = () => SetMetadata(PUBLIC_AUTH, true);
export const OwnerlessAsset = () => SetMetadata(OWNERLESS_ASSET, true);
export const NoSessionActivity = () => SetMetadata(NO_ACTIVITY, true);
