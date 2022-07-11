import { API_AUTH_ROLE } from './api-auth.constants';
import { ApiUserRole } from './api-user.types';

function setApiAuthMetadata(target: any, role: ApiUserRole): void {
  Reflect.defineMetadata(API_AUTH_ROLE, role, target);
}

export const ApiAuth = (role: ApiUserRole): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    if (descriptor) {
      setApiAuthMetadata(descriptor.value, role);
      return descriptor;
    }
    setApiAuthMetadata(target, role);
    return target;
  };
};
