import {
  UploadPartCommand,
  S3Client,
  ListPartsCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, Response } from 'express';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  ALLOWED_EXT_TO_MIME,
  isMultipartUploadContentCompatible,
  normalizeExtension,
  resolveMultipartUploadFileType,
} from '@gitroom/nestjs-libraries/upload/multipart.upload-type';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ACCESS_KEY,
  CLOUDFLARE_SECRET_ACCESS_KEY,
  CLOUDFLARE_BUCKETNAME,
  CLOUDFLARE_BUCKET_URL,
} = process.env;

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_ACCESS_KEY!,
    secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

// Function to generate a random string
function generateRandomString() {
  return makeId(20);
}

export default async function handleR2Upload(
  endpoint: string,
  req: Request,
  res: Response
) {
  switch (endpoint) {
    case 'create-multipart-upload':
      return createMultipartUpload(req, res);
    case 'prepare-upload-parts':
      return prepareUploadParts(req, res);
    case 'complete-multipart-upload':
      return completeMultipartUpload(req, res);
    case 'list-parts':
      return listParts(req, res);
    case 'abort-multipart-upload':
      return abortMultipartUpload(req, res);
    case 'sign-part':
      return signPart(req, res);
  }
  return res.status(404).end();
}

export async function simpleUpload(
  data: Buffer,
  originalFilename: string,
  _contentType: string
) {
  const detected = await fromBuffer(data);
  if (!detected || !Object.values(ALLOWED_EXT_TO_MIME).includes(detected.mime)) {
    throw new Error('Unsupported file type.');
  }
  const fileExtension = `.${detected.ext}`;
  const safeContentType = detected.mime;
  const randomFilename = generateRandomString() + fileExtension;

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: randomFilename,
    Body: data,
    ContentType: safeContentType,
  };

  const command = new PutObjectCommand({ ...params });
  await R2.send(command);

  return CLOUDFLARE_BUCKET_URL + '/' + randomFilename;
}

export async function createMultipartUpload(req: Request, res: Response) {
  const { file, fileHash, contentType } = req.body;
  const uploadType = resolveMultipartUploadFileType(
    file?.name || '',
    file?.type || contentType
  );
  if (!uploadType) {
    return res.status(400).json({ message: 'Unsupported file type.' });
  }
  const randomFilename = generateRandomString() + uploadType.ext;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: `${randomFilename}`,
      ContentType: uploadType.mime,
      Metadata: {
        'x-amz-meta-file-hash': fileHash,
      },
    };

    const command = new CreateMultipartUploadCommand({ ...params });
    const response = await R2.send(command);
    return res.status(200).json({
      uploadId: response.UploadId,
      key: response.Key,
    });
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json({ source: { status: 500 } });
  }
}

export async function prepareUploadParts(req: Request, res: Response) {
  const { partData } = req.body;

  const parts = partData.parts;

  const response = {
    presignedUrls: {},
  };

  for (const part of parts) {
    try {
      const params = {
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: partData.key,
        PartNumber: part.number,
        UploadId: partData.uploadId,
      };
      const command = new UploadPartCommand({ ...params });
      const url = await getSignedUrl(R2, command, { expiresIn: 3600 });

      // @ts-ignore
      response.presignedUrls[part.number] = url;
    } catch (err) {
      console.log('Error', err);
      return res.status(500).json(err);
    }
  }

  return res.status(200).json(response);
}

export async function listParts(req: Request, res: Response) {
  const { key, uploadId } = req.body;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new ListPartsCommand({ ...params });
    const response = await R2.send(command);

    return res.status(200).json(response['Parts']);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function completeMultipartUpload(req: Request, res: Response) {
  const { key, uploadId, parts } = req.body;

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    const response = await R2.send(command);

    const safeExt = normalizeExtension(key || '');
    if (!safeExt) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res.status(400).json({ message: 'Unsupported file type.' });
    }
    const head = await R2.send(
      new GetObjectCommand({
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: key,
        Range: 'bytes=0-4100',
      })
    );
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const chunk of head.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const prefix = Buffer.concat(chunks);
    const detected = await fromBuffer(prefix);

    if (
      !detected ||
      !isMultipartUploadContentCompatible(safeExt, detected.mime)
    ) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res
        .status(400)
        .json({ message: 'File contents do not match declared type.' });
    }

    response.Location =
      process.env.CLOUDFLARE_BUCKET_URL +
      '/' +
      response?.Location?.split('/').at(-1);
    return response;
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function abortMultipartUpload(req: Request, res: Response) {
  const { key, uploadId } = req.body;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new AbortMultipartUploadCommand({ ...params });
    const response = await R2.send(command);

    return res.status(200).json(response);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function signPart(req: Request, res: Response) {
  const { key, uploadId } = req.body;
  const partNumber = parseInt(req.body.partNumber);

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: key,
    PartNumber: partNumber,
    UploadId: uploadId,
    Expires: 3600,
  };

  const command = new UploadPartCommand({ ...params });
  const url = await getSignedUrl(R2, command, { expiresIn: 3600 });

  return res.status(200).json({
    url: url,
  });
}
