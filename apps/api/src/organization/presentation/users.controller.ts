import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { UsersService } from '../application/users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO, Role.GERENTE)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.list(user);
  }

  @Get(':id')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO, Role.GERENTE)
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.usersService.findById(user, id);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @Post(':id/password')
  @HttpCode(200)
  @Roles(Role.ADMINISTRADOR)
  async resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(user, id, dto.password);
  }

  @Patch(':id/status')
  @Roles(Role.ADMINISTRADOR)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(user, id, dto.isActive);
  }
}
