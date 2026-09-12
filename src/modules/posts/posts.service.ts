import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/types/auth-user.interface.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';
import type { ListPostsQueryDto } from './dto/list-posts-query.dto.js';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListPostsQueryDto) {
    const { page, pageSize } = query;
    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count(),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  create(dto: CreatePostDto, author: AuthUser) {
    return this.prisma.post.create({
      data: { ...dto, authorId: author.id },
    });
  }

  async update(id: string, dto: UpdatePostDto, requester: AuthUser) {
    const post = await this.findOne(id);
    this.assertCanModify(post.authorId, requester);

    return this.prisma.post.update({ where: { id }, data: dto });
  }

  async remove(id: string, requester: AuthUser): Promise<void> {
    const post = await this.findOne(id);
    this.assertCanModify(post.authorId, requester);

    await this.prisma.post.delete({ where: { id } });
  }

  private assertCanModify(authorId: string, requester: AuthUser): void {
    const isOwner = authorId === requester.id;
    const isAdmin = requester.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this post');
    }
  }
}
