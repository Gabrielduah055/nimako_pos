import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { PosComponent } from './pages/pos/pos.component';
import { authGuard } from './core/guards/auth.guard';
import { cashierGuard } from './core/guards/cashier.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'pos',
    component: PosComponent,
    canActivate: [authGuard, cashierGuard]
  },
  { path: '', redirectTo: '/pos', pathMatch: 'full' },
  { path: '**', redirectTo: '/pos' }
];
