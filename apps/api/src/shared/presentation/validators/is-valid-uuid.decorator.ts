import { registerDecorator, ValidationOptions } from 'class-validator';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function IsValidUuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidUuid',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: `${propertyName} must be a UUID`,
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && UUID_REGEX.test(value);
        },
      },
    });
  };
}
