import { FirebaseService } from './firebase.service';
import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { FirebaseModuleOptions } from './firebase.types';
import { FIREBASE_OPTIONS } from './firebase.constants';

export interface FirebaseOptionsFactory {
  createFirebaseOptions(): Promise<FirebaseModuleOptions> | FirebaseModuleOptions;
}

export interface FirebaseAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * The `useFactory` syntax allows for creating providers dynamically.
   */
  useFactory: (...args: any[]) => Promise<FirebaseModuleOptions> | FirebaseModuleOptions;
  /**
   * Optional list of providers to be injected into the context of the Factory function.
   */
  inject?: any[];
}

export interface FirebaseModuleAsyncOptions {
  useFactory?: (...args: any[]) => Promise<FirebaseModuleOptions> | FirebaseModuleOptions;
  inject?: any[];
}

@Module({})
export class FirebaseModule {
  static forRoot(options: FirebaseModuleOptions): DynamicModule {
    return {
      global: true,
      module: FirebaseModule,
      providers: [
        {
          provide: FIREBASE_OPTIONS,
          useValue: options
        },
        FirebaseService
      ],
      exports: [FirebaseService]
    };
  }

  static forRootAsync(options: FirebaseAsyncOptions): DynamicModule {
    const providers = [...this.createAsyncProviders(options)];
    return {
      global: true,
      module: FirebaseModule,
      imports: options.imports || [],
      providers,
      exports: providers
    };
  }

  private static createAsyncProviders(options: FirebaseAsyncOptions): Provider[] {
    return [this.createAsyncOptionsProvider(options), FirebaseService];
  }

  private static createAsyncOptionsProvider(options: FirebaseAsyncOptions): Provider {
    return {
      provide: FIREBASE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || []
    };
  }
}
