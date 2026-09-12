import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'My first post' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 'Post content goes here.' })
  @IsString()
  @MinLength(1)
  content!: string;
}
