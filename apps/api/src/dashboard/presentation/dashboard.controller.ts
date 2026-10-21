import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { DashboardService } from '../application/dashboard.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { DashboardMetricsResponse } from './dto/dashboard-metrics.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  async getMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardFilterDto,
  ): Promise<DashboardMetricsResponse> {
    return this.dashboardService.getMetrics(user, query);
  }

  @Get()
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardFilterDto,
  ): Promise<DashboardMetricsResponse> {
    return this.dashboardService.getMetrics(user, query);
  }
}
