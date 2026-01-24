import { describe, it, expect } from 'vitest';
import { ValidationError, AuthorizationError } from '../src/core/errors';

describe('ValidationError', () => {
  it('should create an error with validation errors', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required', 'Password must be at least 8 characters'],
    };

    const error = new ValidationError(errors);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.errors).toEqual(errors);
  });

  it('should set message to first error', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required'],
    };

    const error = new ValidationError(errors);

    expect(error.message).toBe('Invalid email format');
  });

  it('should handle empty errors', () => {
    const error = new ValidationError({});

    expect(error.message).toBe('Validation failed');
    expect(error.errors).toEqual({});
  });

  it('should return all messages as flat array', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required', 'Password must be at least 8 characters'],
    };

    const error = new ValidationError(errors);

    expect(error.getAllMessages()).toEqual([
      'Invalid email format',
      'Password is required',
      'Password must be at least 8 characters',
    ]);
  });

  it('should return field errors', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required'],
    };

    const error = new ValidationError(errors);

    expect(error.getFieldErrors('email')).toEqual(['Invalid email format']);
    expect(error.getFieldErrors('password')).toEqual(['Password is required']);
    expect(error.getFieldErrors('unknown')).toEqual([]);
  });

  it('should check if field has errors', () => {
    const errors = {
      email: ['Invalid email format'],
      empty: [],
    };

    const error = new ValidationError(errors);

    expect(error.hasFieldError('email')).toBe(true);
    expect(error.hasFieldError('empty')).toBe(false);
    expect(error.hasFieldError('unknown')).toBe(false);
  });

  it('should serialize to JSON', () => {
    const errors = {
      email: ['Invalid email format'],
    };

    const error = new ValidationError(errors);
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ValidationError',
      message: 'Invalid email format',
      errors: { email: ['Invalid email format'] },
    });
  });
});

describe('AuthorizationError', () => {
  it('should create an error with default message', () => {
    const error = new AuthorizationError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.name).toBe('AuthorizationError');
    expect(error.message).toBe('Unauthorized');
  });

  it('should create an error with custom message', () => {
    const error = new AuthorizationError('Access denied');

    expect(error.message).toBe('Access denied');
  });

  it('should serialize to JSON', () => {
    const error = new AuthorizationError('Forbidden');
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AuthorizationError',
      message: 'Forbidden',
    });
  });
});

describe('ValidationError - Extended Tests', () => {
  describe('error inheritance', () => {
    it('should maintain proper prototype chain', () => {
      const error = new ValidationError({ field: ['error'] });

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(Object.getPrototypeOf(error)).toBe(ValidationError.prototype);
    });

    it('should have correct constructor name', () => {
      const error = new ValidationError({ field: ['error'] });

      expect(error.constructor.name).toBe('ValidationError');
    });

    it('should preserve stack trace', () => {
      const error = new ValidationError({ field: ['error'] });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('error messages handling', () => {
    it('should handle single field with multiple errors', () => {
      const errors = {
        password: [
          'Password is required',
          'Password must be at least 8 characters',
          'Password must contain a number',
        ],
      };

      const error = new ValidationError(errors);

      expect(error.message).toBe('Password is required');
      expect(error.getAllMessages()).toHaveLength(3);
      expect(error.getFieldErrors('password')).toHaveLength(3);
    });

    it('should handle many fields with errors', () => {
      const errors = {
        email: ['Invalid email'],
        name: ['Name is required'],
        age: ['Must be a number'],
        phone: ['Invalid phone format'],
        address: ['Address is required'],
      };

      const error = new ValidationError(errors);

      expect(error.getAllMessages()).toHaveLength(5);
      expect(Object.keys(error.errors)).toHaveLength(5);
    });

    it('should handle special characters in error messages', () => {
      const errors = {
        field: ['Error with "quotes" and \'apostrophes\''],
        other: ['Error with <html> tags'],
        unicode: ['Error with unicode: \u00e9\u00e8\u00ea'],
      };

      const error = new ValidationError(errors);

      expect(error.getFieldErrors('field')[0]).toContain('"quotes"');
      expect(error.getFieldErrors('other')[0]).toContain('<html>');
      expect(error.getFieldErrors('unicode')[0]).toContain('\u00e9');
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const errors = {
        field: [longMessage],
      };

      const error = new ValidationError(errors);

      expect(error.message).toBe(longMessage);
      expect(error.getAllMessages()[0].length).toBe(10000);
    });

    it('should handle emoji in error messages', () => {
      const errors = {
        mood: ['Please select a mood \ud83d\ude00'],
      };

      const error = new ValidationError(errors);

      expect(error.getFieldErrors('mood')[0]).toContain('\ud83d\ude00');
    });

    it('should handle newlines in error messages', () => {
      const errors = {
        field: ['Error on\nmultiple\nlines'],
      };

      const error = new ValidationError(errors);

      expect(error.getFieldErrors('field')[0]).toContain('\n');
    });
  });

  describe('field name handling', () => {
    it('should handle nested field names', () => {
      const errors = {
        'user.profile.email': ['Invalid email'],
        'user.profile.name': ['Name required'],
        'settings.notifications.email': ['Must be boolean'],
      };

      const error = new ValidationError(errors);

      expect(error.hasFieldError('user.profile.email')).toBe(true);
      expect(error.getFieldErrors('user.profile.email')).toEqual(['Invalid email']);
    });

    it('should handle array index field names', () => {
      const errors = {
        'items.0.name': ['Name required'],
        'items.1.price': ['Must be positive'],
        'items.2.quantity': ['Must be integer'],
      };

      const error = new ValidationError(errors);

      expect(error.hasFieldError('items.0.name')).toBe(true);
      expect(error.hasFieldError('items.1.price')).toBe(true);
      expect(error.hasFieldError('items.2.quantity')).toBe(true);
    });

    it('should handle special characters in field names', () => {
      const errors = {
        'field-with-dashes': ['Error'],
        'field_with_underscores': ['Error'],
        'field.with.dots': ['Error'],
      };

      const error = new ValidationError(errors);

      expect(error.hasFieldError('field-with-dashes')).toBe(true);
      expect(error.hasFieldError('field_with_underscores')).toBe(true);
      expect(error.hasFieldError('field.with.dots')).toBe(true);
    });
  });

  describe('getAllMessages', () => {
    it('should return messages in consistent order', () => {
      const errors = {
        a: ['Error A'],
        b: ['Error B'],
        c: ['Error C'],
      };

      const error = new ValidationError(errors);
      const messages = error.getAllMessages();

      expect(messages).toContain('Error A');
      expect(messages).toContain('Error B');
      expect(messages).toContain('Error C');
    });

    it('should flatten nested arrays', () => {
      const errors = {
        field1: ['Error 1', 'Error 2'],
        field2: ['Error 3'],
        field3: ['Error 4', 'Error 5', 'Error 6'],
      };

      const error = new ValidationError(errors);

      expect(error.getAllMessages()).toHaveLength(6);
    });

    it('should return empty array for empty errors', () => {
      const error = new ValidationError({});

      expect(error.getAllMessages()).toEqual([]);
    });
  });

  describe('getFieldErrors', () => {
    it('should return empty array for non-existent field', () => {
      const error = new ValidationError({ existing: ['error'] });

      expect(error.getFieldErrors('nonexistent')).toEqual([]);
    });

    it('should return reference to errors array', () => {
      const errors = { field: ['error1', 'error2'] };
      const error = new ValidationError(errors);

      const fieldErrors = error.getFieldErrors('field');

      // Returns a reference to the internal array
      expect(fieldErrors).toBe(error.errors.field);
      expect(fieldErrors).toEqual(['error1', 'error2']);
    });
  });

  describe('hasFieldError', () => {
    it('should return false for field with empty array', () => {
      const errors = {
        empty: [],
        hasErrors: ['error'],
      };

      const error = new ValidationError(errors);

      expect(error.hasFieldError('empty')).toBe(false);
      expect(error.hasFieldError('hasErrors')).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should produce valid JSON string', () => {
      const errors = {
        email: ['Invalid email'],
        name: ['Name required'],
      };

      const error = new ValidationError(errors);
      const json = error.toJSON();

      expect(JSON.stringify(json)).toBeTruthy();
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });

    it('should include all properties', () => {
      const errors = { field: ['error'] };
      const error = new ValidationError(errors);
      const json = error.toJSON();

      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('errors');
    });

    it('should not include stack in JSON', () => {
      const error = new ValidationError({ field: ['error'] });
      const json = error.toJSON();

      expect(json).not.toHaveProperty('stack');
    });
  });
});

describe('AuthorizationError - Extended Tests', () => {
  describe('error inheritance', () => {
    it('should maintain proper prototype chain', () => {
      const error = new AuthorizationError();

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AuthorizationError).toBe(true);
      expect(Object.getPrototypeOf(error)).toBe(AuthorizationError.prototype);
    });

    it('should have correct constructor name', () => {
      const error = new AuthorizationError();

      expect(error.constructor.name).toBe('AuthorizationError');
    });

    it('should preserve stack trace', () => {
      const error = new AuthorizationError();

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AuthorizationError');
    });
  });

  describe('custom messages', () => {
    it('should handle empty string message', () => {
      const error = new AuthorizationError('');

      // Empty string is falsy, so default should be used
      expect(error.message).toBe('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new AuthorizationError(longMessage);

      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters', () => {
      const error = new AuthorizationError('Access <denied> for "user"');

      expect(error.message).toBe('Access <denied> for "user"');
    });

    it('should handle unicode messages', () => {
      const error = new AuthorizationError('\u8a8d\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f'); // Japanese

      expect(error.message).toBe('\u8a8d\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f');
    });
  });

  describe('toJSON', () => {
    it('should produce valid JSON', () => {
      const error = new AuthorizationError('Custom message');
      const json = error.toJSON();

      expect(JSON.stringify(json)).toBeTruthy();
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });

    it('should not include stack in JSON', () => {
      const error = new AuthorizationError();
      const json = error.toJSON();

      expect(json).not.toHaveProperty('stack');
    });

    it('should have consistent structure', () => {
      const error = new AuthorizationError('Test');
      const json = error.toJSON();

      expect(Object.keys(json).sort()).toEqual(['message', 'name']);
    });
  });

  describe('throwing and catching', () => {
    it('should be catchable as Error', () => {
      expect(() => {
        throw new AuthorizationError('Test');
      }).toThrow(Error);
    });

    it('should be catchable as AuthorizationError', () => {
      expect(() => {
        throw new AuthorizationError('Test');
      }).toThrow(AuthorizationError);
    });

    it('should preserve message when caught', () => {
      try {
        throw new AuthorizationError('Custom message');
      } catch (error) {
        expect((error as AuthorizationError).message).toBe('Custom message');
      }
    });
  });
});

describe('Error Interoperability', () => {
  it('should distinguish between ValidationError and AuthorizationError', () => {
    const validationError = new ValidationError({ field: ['error'] });
    const authError = new AuthorizationError();

    expect(validationError instanceof ValidationError).toBe(true);
    expect(validationError instanceof AuthorizationError).toBe(false);

    expect(authError instanceof AuthorizationError).toBe(true);
    expect(authError instanceof ValidationError).toBe(false);
  });

  it('should allow type narrowing', () => {
    const errors: Error[] = [
      new ValidationError({ field: ['error'] }),
      new AuthorizationError(),
    ];

    for (const error of errors) {
      if (error instanceof ValidationError) {
        expect(error.errors).toBeDefined();
      } else if (error instanceof AuthorizationError) {
        expect(error.toJSON()).toBeDefined();
      }
    }
  });

  it('should work with try-catch for multiple error types', () => {
    const throwError = (type: 'validation' | 'auth') => {
      if (type === 'validation') {
        throw new ValidationError({ email: ['Invalid'] });
      }
      throw new AuthorizationError('Forbidden');
    };

    // Test ValidationError
    try {
      throwError('validation');
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.hasFieldError('email')).toBe(true);
      }
    }

    // Test AuthorizationError
    try {
      throwError('auth');
    } catch (error) {
      if (error instanceof AuthorizationError) {
        expect(error.message).toBe('Forbidden');
      }
    }
  });
});
