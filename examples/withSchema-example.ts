/**
 * Examples of using the simpler withSchema API
 *
 * Use withSchema when you don't need hooks or authorization - just schema validation.
 * This is much simpler than creating a full FormRequest class.
 */

import { withSchema, withApiSchema, ZodAdapter, ValidationError } from 'next-request';
import { z } from 'zod';

// ============================================================================
// App Router Examples (Next.js 13+ with app directory)
// ============================================================================

// Example 1: Simple POST endpoint with schema validation
const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(18).optional(),
});

export const POST = withSchema(new ZodAdapter(createUserSchema), async (data) => {
  // data is automatically typed as { name: string; email: string; age?: number }

  // Your business logic here
  const user = await db.users.create({
    data: {
      name: data.name,
      email: data.email,
      age: data.age,
    },
  });

  return Response.json({ user }, { status: 201 });
});

// Example 2: With error handling
const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

export const PATCH = async (request: Request) => {
  try {
    const handler = withSchema(new ZodAdapter(updateUserSchema), async (data) => {
      const user = await db.users.update({
        where: { id: params.id },
        data,
      });
      return Response.json({ user });
    });

    return await handler(request);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { errors: error.errors },
        { status: 422 }
      );
    }
    throw error;
  }
};

// Example 3: Complex nested schema
const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).max(5),
  metadata: z.object({
    category: z.enum(['tech', 'business', 'lifestyle']),
    featured: z.boolean().default(false),
  }),
});

export const POST_COMPLEX = withSchema(new ZodAdapter(createPostSchema), async (data) => {
  // data is fully typed with all nested structures
  const post = await db.posts.create({
    data: {
      title: data.title,
      content: data.content,
      tags: data.tags,
      category: data.metadata.category,
      featured: data.metadata.featured,
    },
  });

  return Response.json({ post }, { status: 201 });
});

// Example 4: With schema transformations
const loginSchema = z.object({
  email: z.string().email().transform(val => val.toLowerCase()),
  password: z.string().min(8),
});

export const POST_LOGIN = withSchema(new ZodAdapter(loginSchema), async (data) => {
  // data.email is automatically lowercase
  const user = await db.users.findUnique({
    where: { email: data.email },
  });

  if (!user || !await comparePassword(data.password, user.password)) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = generateToken(user);
  return Response.json({ token, user });
});

// ============================================================================
// Pages Router Examples (Next.js with pages directory)
// ============================================================================

// Example 5: Pages Router API route
import type { NextApiRequest, NextApiResponse } from 'next';

const createCommentSchema = z.object({
  postId: z.string(),
  content: z.string().min(1).max(500),
  authorName: z.string().min(1),
});

export default withApiSchema(
  new ZodAdapter(createCommentSchema),
  async (data, req, res) => {
    // data is typed as { postId: string; content: string; authorName: string }

    const comment = await db.comments.create({
      data: {
        postId: data.postId,
        content: data.content,
        authorName: data.authorName,
      },
    });

    res.status(201).json({ comment });
  }
);

// Example 6: Pages Router with error handling
const updateSettingsSchema = z.object({
  notifications: z.boolean(),
  theme: z.enum(['light', 'dark']),
  language: z.string().optional(),
});

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const wrappedHandler = withApiSchema(
      new ZodAdapter(updateSettingsSchema),
      async (data, req, res) => {
        const settings = await db.settings.update({
          where: { userId: req.session.userId },
          data,
        });
        res.status(200).json({ settings });
      }
    );

    await wrappedHandler(req, res);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(422).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// ============================================================================
// Reusable Schema Patterns
// ============================================================================

// You can create and reuse schemas across multiple endpoints
const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

const listUsersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['admin', 'user', 'guest']).optional(),
}).merge(paginationSchema);

export const GET_USERS = withSchema(new ZodAdapter(listUsersSchema), async (data) => {
  const users = await db.users.findMany({
    where: {
      ...(data.search && {
        OR: [
          { name: { contains: data.search } },
          { email: { contains: data.search } },
        ],
      }),
      ...(data.role && { role: data.role }),
    },
    skip: (data.page - 1) * data.limit,
    take: data.limit,
  });

  return Response.json({ users, page: data.page, limit: data.limit });
});

// ============================================================================
// When to use withSchema vs withRequest (FormRequest)
// ============================================================================

/**
 * Use withSchema when:
 * - You only need schema validation
 * - No authorization logic needed
 * - No data transformation hooks needed
 * - Simple, straightforward endpoints
 *
 * Use withRequest (FormRequest class) when:
 * - You need authorization logic (authorize() method)
 * - You need data transformation (beforeValidation() hook)
 * - You want custom error messages (messages() method)
 * - You want custom field names (attributes() method)
 * - Complex, reusable validation logic across multiple endpoints
 */

// Pseudo-code database reference (not actual implementation)
const db = {
  users: {
    create: async (data: any) => ({ id: '1', ...data.data }),
    update: async (options: any) => ({ id: '1', ...options.data }),
    findUnique: async (options: any) => ({ id: '1', email: 'test@example.com', password: 'hashed' }),
    findMany: async (options: any) => [{ id: '1', name: 'User 1' }],
  },
  posts: {
    create: async (data: any) => ({ id: '1', ...data.data }),
  },
  comments: {
    create: async (data: any) => ({ id: '1', ...data.data }),
  },
  settings: {
    update: async (options: any) => ({ id: '1', ...options.data }),
  },
};

const comparePassword = async (plain: string, hashed: string) => true;
const generateToken = (user: any) => 'token';
const params = { id: '1' };
