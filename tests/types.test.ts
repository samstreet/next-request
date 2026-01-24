import { describe, it, expect } from 'vitest';
import { isAppRouterRequest, isPagesRouterRequest } from '../src/core/types';

describe('Type Guards', () => {
  describe('isAppRouterRequest', () => {
    it('should return true for App Router Request', () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      expect(isAppRouterRequest(request)).toBe(true);
    });

    it('should return true for minimal Request', () => {
      const request = new Request('http://localhost:3000/api/test');

      expect(isAppRouterRequest(request)).toBe(true);
    });

    it('should return false for Pages Router NextApiRequest', () => {
      const request = {
        method: 'POST',
        body: { test: true },
        query: {},
        headers: { 'content-type': 'application/json' },
      };

      expect(isAppRouterRequest(request as any)).toBe(false);
    });

    it('should return false for object with headers as plain object', () => {
      const request = {
        headers: { 'content-type': 'application/json' },
        method: 'GET',
        query: {},
      };

      expect(isAppRouterRequest(request as any)).toBe(false);
    });

    it('should handle Request with all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

      for (const method of methods) {
        const request = new Request('http://localhost:3000/api/test', { method });
        expect(isAppRouterRequest(request)).toBe(true);
      }
    });

    it('should work with Request containing FormData', () => {
      const formData = new FormData();
      formData.append('test', 'value');

      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        body: formData,
      });

      expect(isAppRouterRequest(request)).toBe(true);
    });

    it('should work with Request containing URL search params body', () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ test: 'value' }),
      });

      expect(isAppRouterRequest(request)).toBe(true);
    });
  });

  describe('isPagesRouterRequest', () => {
    it('should return true for Pages Router NextApiRequest', () => {
      const request = {
        method: 'POST',
        body: { test: true },
        query: {},
        headers: { 'content-type': 'application/json' },
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should return true for NextApiRequest with query params', () => {
      const request = {
        method: 'GET',
        body: {},
        query: { id: '123', page: '1' },
        headers: {},
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should return false for App Router Request', () => {
      const request = new Request('http://localhost:3000/api/test');

      expect(isPagesRouterRequest(request)).toBe(false);
    });

    it('should handle NextApiRequest with array query params', () => {
      const request = {
        method: 'GET',
        body: {},
        query: { tags: ['a', 'b', 'c'] },
        headers: {},
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should handle NextApiRequest with null body', () => {
      const request = {
        method: 'GET',
        body: null,
        query: {},
        headers: {},
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should handle NextApiRequest with complex body', () => {
      const request = {
        method: 'POST',
        body: {
          user: {
            name: 'John',
            emails: ['a@b.com', 'c@d.com'],
          },
          metadata: null,
        },
        query: {},
        headers: { 'content-type': 'application/json' },
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should return false for object without query property', () => {
      const request = {
        method: 'GET',
        body: {},
        headers: {},
      };

      expect(isPagesRouterRequest(request as any)).toBe(false);
    });
  });

  describe('type guard exclusivity', () => {
    it('should be mutually exclusive for App Router Request', () => {
      const request = new Request('http://localhost:3000/api/test');

      expect(isAppRouterRequest(request)).toBe(true);
      expect(isPagesRouterRequest(request)).toBe(false);
    });

    it('should be mutually exclusive for Pages Router Request', () => {
      const request = {
        method: 'POST',
        body: {},
        query: {},
        headers: { 'content-type': 'application/json' },
      };

      expect(isAppRouterRequest(request as any)).toBe(false);
      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should handle edge case objects correctly', () => {
      // Object with headers property but not instanceof Headers
      const edgeCase1 = {
        headers: { 'content-type': 'application/json' },
        query: { id: '1' },
        body: {},
        method: 'GET',
      };

      expect(isAppRouterRequest(edgeCase1 as any)).toBe(false);
      expect(isPagesRouterRequest(edgeCase1 as any)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty Request', () => {
      const request = new Request('http://localhost:3000/');

      expect(isAppRouterRequest(request)).toBe(true);
      expect(isPagesRouterRequest(request)).toBe(false);
    });

    it('should handle Request with custom headers', () => {
      const headers = new Headers();
      headers.set('x-custom', 'value');
      headers.set('authorization', 'Bearer token');

      const request = new Request('http://localhost:3000/api/test', {
        headers,
      });

      expect(isAppRouterRequest(request)).toBe(true);
    });

    it('should handle NextApiRequest with array headers', () => {
      const request = {
        method: 'GET',
        body: {},
        query: {},
        headers: {
          'set-cookie': ['cookie1=value1', 'cookie2=value2'],
        },
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });

    it('should handle NextApiRequest with undefined values', () => {
      const request = {
        method: 'GET',
        body: undefined,
        query: {},
        headers: {},
      };

      expect(isPagesRouterRequest(request as any)).toBe(true);
    });
  });
});
