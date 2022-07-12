import { AuthType, AUTH_TYPES } from './auth.constants';

function setAuthTypesMetadata(target: any, types: AuthType[]): void {
  Reflect.defineMetadata(AUTH_TYPES, types, target);
}
