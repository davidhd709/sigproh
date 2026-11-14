import { Component, input } from '@angular/core';

/** Pasos del informe, iguales al crear y al editar el borrador. */
export const REPORT_FLOW_STEPS = ['Elegir período y ubicación', 'Revisar contenido', 'Guardar borrador o finalizar'] as const;

@Component({
  selector: 'app-report-flow-steps',
  standalone: true,
  template: `
    <ol class="flow-steps" aria-label="Pasos para crear un informe">
      @for (label of steps; track label; let i = $index) {
        <li
          [class.done]="i + 1 < current()"
          [class.current]="i + 1 === current() || (current() === 2 && i === 2)"
          [attr.aria-current]="i + 1 === current() ? 'step' : null"
        >
          <span class="flow-num">{{ i + 1 }}</span>
          <span class="flow-label">{{ label }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .flow-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1rem;
      margin: 0 0 1.25rem;
      padding: 0;
      list-style: none;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .flow-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 999px;
      border: 1.5px solid var(--border);
      font-weight: 700;
      font-size: 0.8rem;
    }
    .current {
      color: var(--text);
      font-weight: 600;
    }
    .current .flow-num {
      border-color: var(--primary);
      background: var(--primary);
      color: #fff;
    }
    .done .flow-num {
      border-color: var(--primary);
      color: var(--primary);
    }
  `,
})
export class ReportFlowStepsComponent {
  /** 1: crear, 2: borrador (revisar y luego guardar o finalizar). */
  readonly current = input<1 | 2>(1);
  readonly steps = REPORT_FLOW_STEPS;
}
