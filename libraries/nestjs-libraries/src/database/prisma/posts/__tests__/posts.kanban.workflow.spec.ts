import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { PostsService } from '../posts.service';

vi.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.search.attribute', () => ({
  organizationId: 'organizationId',
  postId: 'postId',
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.repository', () => ({
  PostsRepository: class PostsRepository {},
}));
vi.mock('@gitroom/nestjs-libraries/dtos/posts/create.post.dto', () => ({}));
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
vi.mock('@gitroom/nestjs-libraries/dtos/posts/get.posts.dto', () => ({}));
vi.mock('@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto', () => ({}));
vi.mock('@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto', () => ({}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class IntegrationService {},
}));
vi.mock('@gitroom/nestjs-libraries/services/make.is', () => ({
  makeId: () => 'mock-id',
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: class MediaService {},
}));
vi.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkService {},
}));
vi.mock('@gitroom/helpers/utils/posts.list.minify', () => ({
  minifyPosts: (posts: unknown) => posts,
  minifyPostsList: (posts: unknown) => posts,
}));
vi.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
}));
vi.mock('@gitroom/helpers/utils/timer', () => ({
  timer: () => Promise.resolve(),
}));
vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
vi.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({
  RefreshToken: class RefreshToken extends Error {},
}));
vi.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({
  RefreshIntegrationService: class RefreshIntegrationService {},
}));
vi.mock('@gitroom/helpers/utils/has.extension', () => ({
  hasExtension: () => false,
}));
vi.mock('@gitroom/helpers/utils/strip.links', () => ({
  stripLinks: (text: string) => text,
}));
vi.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: (_mode: string, text: string) => text,
}));
vi.mock('@gitroom/helpers/utils/count.length', () => ({
  weightedLength: (text: string) => text.length,
}));

const orgId = 'org-1';
const group = 'group-1';
const futureDate = '2026-06-13T16:00:00.000Z';

const makePost = (overrides: Record<string, any> = {}) => ({
  id: overrides.id || 'post-1',
  group: overrides.group || 'group-1',
  state: overrides.state || 'DRAFT',
  publishDate: overrides.publishDate ?? new Date('2026-06-12T16:00:00.000Z'),
  parentPostId: overrides.parentPostId ?? null,
  integration: overrides.integration || { providerIdentifier: 'x' },
});

const makeService = (posts: any[]) => {
  const repository = {
    getPostsByGroup: vi.fn().mockResolvedValue(posts),
    updateGroupWorkflowState: vi.fn().mockResolvedValue({ count: posts.length }),
  };
  const service = new PostsService(
    repository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      client: {
        getRawClient: () => ({
          workflow: {
            list: vi.fn(),
          },
        }),
      },
    } as any,
    {} as any
  );
  vi.spyOn(service, 'startWorkflow').mockResolvedValue(undefined as any);
  return { service, repository };
};

describe('PostsService.changeGroupStatusForKanban', () => {
  it('throws NotFoundException when group is empty', async () => {
    const { service, repository } = makeService([]);

    await expect(
      (service as any).changeGroupStatusForKanban(orgId, group, {
        target: 'draft',
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.getPostsByGroup).toHaveBeenCalledWith(orgId, group);
    expect(repository.updateGroupWorkflowState).not.toHaveBeenCalled();
    expect(service.startWorkflow).not.toHaveBeenCalled();
  });

  it('moves DRAFT to scheduled with a future date and starts workflow without publish-now', async () => {
    const post = makePost({ state: 'DRAFT' });
    const { service, repository } = makeService([post]);

    const result = await (service as any).changeGroupStatusForKanban(
      orgId,
      group,
      {
        target: 'scheduled',
        date: futureDate,
      }
    );

    expect(result).toEqual({
      ok: true,
      group: 'group-1',
      state: 'QUEUE',
      publishDate: '2026-06-13T16:00:00.000Z',
    });
    expect(repository.updateGroupWorkflowState).toHaveBeenCalledWith(
      orgId,
      group,
      {
        state: 'QUEUE',
        publishDate: new Date('2026-06-13T16:00:00.000Z'),
        clearRelease: true,
        clearError: true,
      }
    );
    expect(service.startWorkflow).toHaveBeenCalledWith(
      'x',
      post.id,
      orgId,
      'QUEUE',
      false
    );
  });

  it('moves QUEUE to draft and starts workflow without publish-now', async () => {
    const post = makePost({ state: 'QUEUE' });
    const { service, repository } = makeService([post]);

    const result = await (service as any).changeGroupStatusForKanban(
      orgId,
      group,
      {
        target: 'draft',
      }
    );

    expect(result).toEqual({ ok: true, group: 'group-1', state: 'DRAFT' });
    expect(repository.updateGroupWorkflowState).toHaveBeenCalledWith(
      orgId,
      group,
      { state: 'DRAFT', clearRelease: true, clearError: true }
    );
    expect(service.startWorkflow).toHaveBeenCalledWith(
      'x',
      post.id,
      orgId,
      'DRAFT',
      false
    );
  });

  it('moves ERROR to publish_now as QUEUE and starts workflow with publish-now', async () => {
    const post = makePost({ state: 'ERROR' });
    const { service, repository } = makeService([post]);

    const result = await (service as any).changeGroupStatusForKanban(
      orgId,
      group,
      {
        target: 'publish_now',
      }
    );

    expect(result).toEqual({
      ok: true,
      group: 'group-1',
      state: 'QUEUE',
      publishingNow: true,
    });
    expect(repository.updateGroupWorkflowState).toHaveBeenCalledWith(
      orgId,
      group,
      {
        state: 'QUEUE',
        publishDate: expect.any(Date),
        clearRelease: true,
        clearError: true,
      }
    );
    expect(service.startWorkflow).toHaveBeenCalledWith(
      'x',
      post.id,
      orgId,
      'QUEUE',
      true
    );
  });

  it('rejects transitions from PUBLISHED origin', async () => {
    const { service, repository } = makeService([
      makePost({ state: 'PUBLISHED' }),
    ]);

    await expect(
      (service as any).changeGroupStatusForKanban(orgId, group, {
        target: 'draft',
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.updateGroupWorkflowState).not.toHaveBeenCalled();
    expect(service.startWorkflow).not.toHaveBeenCalled();
  });

  it('rejects scheduled target without date', async () => {
    const { service, repository } = makeService([makePost({ state: 'DRAFT' })]);

    await expect(
      (service as any).changeGroupStatusForKanban(orgId, group, {
        target: 'scheduled',
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.updateGroupWorkflowState).not.toHaveBeenCalled();
    expect(service.startWorkflow).not.toHaveBeenCalled();
  });
});
