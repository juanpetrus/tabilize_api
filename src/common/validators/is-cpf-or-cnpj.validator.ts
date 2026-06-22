import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Valida os dígitos verificadores de um CPF (11 dígitos). */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  // Rejeita sequências repetidas (000..., 111..., etc.)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);

  const calcDv = (count: number): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += digits[i] * (count + 1 - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  return calcDv(9) === digits[9] && calcDv(10) === digits[10];
}

/** Valida os dígitos verificadores de um CNPJ (14 dígitos). */
export function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map(Number);

  const calcDv = (count: number): number => {
    // Pesos vão de 2 até 9, ciclicamente, da direita para a esquerda.
    let sum = 0;
    let weight = 2;
    for (let i = count - 1; i >= 0; i--) {
      sum += digits[i] * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  return calcDv(12) === digits[12] && calcDv(13) === digits[13];
}

@ValidatorConstraint({ name: 'isCpfOrCnpj', async: false })
export class IsCpfOrCnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return isValidCpf(value) || isValidCnpj(value);
  }

  defaultMessage(): string {
    return 'Documento inválido: informe um CPF ou CNPJ válido (somente números)';
  }
}

/**
 * Decorator de validação: aceita CPF (11 dígitos) ou CNPJ (14 dígitos)
 * verificando os dígitos verificadores. Espera somente números.
 */
export function IsCpfOrCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCpfOrCnpjConstraint,
    });
  };
}
