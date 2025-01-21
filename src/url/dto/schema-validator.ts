// Using class validator, and create a new custom decorator to validate our schema
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsValidSchemaConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const schema = args.constraints[0];
    if (!schema) {
      return false;
    }

    // use ajv, zod or similar here to validate against schema
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return `Schema validation failed for ${args.property}.`;
  }
}

export function IsValidSchema(
  schema: any,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [schema],
      validator: IsValidSchemaConstraint,
    });
  };
}
