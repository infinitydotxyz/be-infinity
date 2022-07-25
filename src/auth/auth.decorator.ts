import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { AUTH_API_ROLES, AUTH_SITE_ROLES, SiteRole } from './auth.constants';

function setAuthSiteRolesMetadata(target: any, roles: SiteRole[]): void {
  Reflect.defineMetadata(AUTH_SITE_ROLES, roles, target);
}

function setAuthApiRolesMetadata(target: any, roles: ApiRole[]): void {
  Reflect.defineMetadata(AUTH_API_ROLES, roles, target);
}

export const RequireAuth = (siteRoles: SiteRole[], apiRoles: ApiRole[]): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    if (descriptor) {
      setAuthSiteRolesMetadata(descriptor.value, siteRoles);
      setAuthApiRolesMetadata(descriptor.value, apiRoles);
      return descriptor;
    }
    setAuthSiteRolesMetadata(target, siteRoles);
    setAuthApiRolesMetadata(target, apiRoles);
    return target;
  };
};
