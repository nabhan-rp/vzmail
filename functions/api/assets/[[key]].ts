import type { PagesFunction } from '../../types';

export const onRequestGet: PagesFunction = async (context) => {
  const keyParam = context.params.key;
  const objectKey = Array.isArray(keyParam) ? keyParam.join('/') : keyParam;

  if (!objectKey || !context.env.ASSETS_BUCKET) {
    return new Response('Asset not found or R2 bucket not bound', { status: 404 });
  }

  const object = await context.env.ASSETS_BUCKET.get(objectKey);
  if (!object) {
    return new Response('Asset not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
};
