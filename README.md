# next-request

Laravel-inspired Form Request validation for Next.js API routes.

[![npm version](https://img.shields.io/npm/v/next-request.svg)](https://www.npmjs.com/package/next-request)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Laravel-style Form Requests** - Familiar `rules()`, `authorize()`, `beforeValidation()` hooks
- **Validator Agnostic** - Use Zod, Yup, or bring your own validator
- **Full TypeScript Support** - Complete type inference for validated data
- **Works with Both Routers** - App Router and Pages Router support
- **Flexible API** - Manual instantiation or convenient wrapper functions

## Installation

```bash
npm install next-request
```

With Zod (recommended):
```bash
npm install next-request zod
```

## Quick Start

### 1. Define a Form Request

```typescript
// requests/CreateUserRequest.ts
import { FormRequest, ZodAdapter } from 'next-request';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
});

export class CreateUserRequest extends FormRequest<z.infer<typeof schema>> {
  rules() {
    return new ZodAdapter(schema);
  }
}
```

### 2. Use in Your API Route

**App Router (Next.js 13+)**
```typescript
// app/api/users/route.ts
import { CreateUserRequest, ValidationError, AuthorizationError } from 'next-request';

export async function POST(request: Request) {
  try {
    const form = await CreateUserRequest.fromAppRouter(request);
    const data = await form.validate();

    // data is fully typed as { email: string; name: string; password: string }
    const user = await db.users.create({ data });
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ errors: error.errors }, { status: 422 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }
    throw error;
  }
}
```

**Pages Router**
```typescript
// pages/api/users.ts
import { CreateUserRequest, ValidationError } from 'next-request';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const form = await CreateUserRequest.fromPagesRouter(req);
    const data = await form.validate();

    const user = await db.users.create({ data });
    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json({ errors: error.errors });
    }
    throw error;
  }
}
```

## Using Wrapper Functions

For cleaner code, use the wrapper functions:

```typescript
// app/api/users/route.ts
import { withRequest } from 'next-request';
import { CreateUserRequest } from '@/requests/CreateUserRequest';

export const POST = withRequest(CreateUserRequest, async (data, request) => {
  const user = await db.users.create({ data });
  return Response.json({ user }, { status: 201 });
});
```

### With Custom Error Handling

```typescript
import { createAppRouterWrapper, ValidationError, AuthorizationError } from 'next-request';

const withValidation = createAppRouterWrapper({
  onValidationError: (error) =>
    Response.json({ errors: error.errors }, { status: 422 }),
  onAuthorizationError: () =>
    Response.json({ message: 'Forbidden' }, { status: 403 }),
});

export const POST = withValidation(CreateUserRequest, async (data) => {
  const user = await db.users.create({ data });
  return Response.json({ user }, { status: 201 });
});
```

## Lifecycle Hooks

Form Requests support Laravel-style hooks:

```typescript
class CreateUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(schema);
  }

  // Check if the user is authorized to make this request
  async authorize() {
    const session = await getSession(this.request);
    return session?.user?.role === 'admin';
  }

  // Transform data before validation
  beforeValidation() {
    if (this.body.email) {
      this.body.email = this.body.email.toLowerCase().trim();
    }
  }

  // Called after successful validation
  afterValidation(data: UserData) {
    console.log('Creating user:', data.email);
  }

  // Called when validation fails
  onValidationFailed(errors: ValidationErrors) {
    console.error('Validation failed:', errors);
  }

  // Called when authorization fails
  onAuthorizationFailed() {
    console.error('Unauthorized request attempt');
  }
}
```

## Custom Messages

Override error messages and attribute names:

```typescript
class CreateUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(schema);
  }

  messages() {
    return {
      'email.invalid_string': 'Please provide a valid email address',
      'password.too_small': 'Password must be at least 8 characters',
    };
  }

  attributes() {
    return {
      email: 'email address',
      dob: 'date of birth',
    };
  }
}
```

## Helper Methods

Access request data with convenient helpers:

```typescript
const form = await MyRequest.fromAppRouter(request, { id: '123' });

// Get input values
form.input('email');                    // Get a value
form.input('missing', 'default');       // With default
form.has('email');                      // Check existence
form.all();                             // Get all body data

// Filter input
form.only('email', 'name');             // Only these keys
form.except('password');                // All except these

// Route params & headers
form.param('id');                       // Route parameter
form.header('content-type');            // Header value

// After validation
const data = await form.validate();
form.validated();                       // Get validated data again
```

## Creating Custom Validator Adapters

Implement the `ValidatorAdapter` interface to use any validation library:

```typescript
import type { ValidatorAdapter, ValidationResult, ValidationConfig } from 'next-request';
import * as yup from 'yup';

class YupAdapter<T> implements ValidatorAdapter<T> {
  constructor(private schema: yup.Schema<T>) {}

  async validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>> {
    try {
      const validated = await this.schema.validate(data, { abortEarly: false });
      return { success: true, data: validated };
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const errors: Record<string, string[]> = {};
        for (const err of error.inner) {
          const path = err.path || '_root';
          errors[path] = errors[path] || [];
          errors[path].push(err.message);
        }
        return { success: false, errors };
      }
      throw error;
    }
  }
}
```

## API Reference

### FormRequest

| Method | Description |
|--------|-------------|
| `rules()` | **Required.** Return a ValidatorAdapter instance |
| `authorize()` | Return `true` to allow, `false` to reject |
| `beforeValidation()` | Transform `this.body` before validation |
| `afterValidation(data)` | Called after successful validation |
| `onValidationFailed(errors)` | Called when validation fails |
| `onAuthorizationFailed()` | Called when authorization fails |
| `messages()` | Custom error messages |
| `attributes()` | Custom attribute names |

### Static Factory Methods

| Method | Description |
|--------|-------------|
| `fromAppRouter(request, params?)` | Create from App Router Request |
| `fromPagesRouter(request, params?)` | Create from Pages Router NextApiRequest |

### Wrapper Functions

| Function | Description |
|----------|-------------|
| `withRequest(RequestClass, handler)` | Wrap App Router handler |
| `withApiRequest(RequestClass, handler)` | Wrap Pages Router handler |
| `createAppRouterWrapper(options)` | Create wrapper with custom error handling |
| `createPagesRouterWrapper(options)` | Create wrapper with custom error handling |

### Error Classes

| Class | Description |
|-------|-------------|
| `ValidationError` | Thrown when validation fails. Has `.errors` property |
| `AuthorizationError` | Thrown when `authorize()` returns false |

## License

MIT
