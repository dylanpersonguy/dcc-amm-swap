/**
 * Breadcrumbs — navigation breadcrumbs for pool detail views.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const navigate = useNavigate();

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="breadcrumb-sep">›</span>}
          {item.path ? (
            <button
              className="breadcrumb-link"
              onClick={() => navigate(item.path!)}
            >
              {item.label}
            </button>
          ) : (
            <span className="breadcrumb-current">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
