import React from 'react';

/**
 * AdminPageHeader — Consistent page header for admin dashboard sections.
 * Renders title, subtitle, and optional action buttons.
 * Uses admin design tokens from admin-dashboard.css.
 */
const AdminPageHeader = ({ title, subtitle, actions, children }) => {
  return (
    <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1
          className="text-2xl md:text-3xl lg:text-4xl font-bold mb-1.5 tracking-tight"
          style={{
            color: 'hsl(var(--admin-text-primary))',
            fontFamily: "'Montserrat', 'Poppins', system-ui, sans-serif",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-sm md:text-base"
            style={{ color: 'hsl(var(--admin-text-secondary))' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex flex-wrap gap-2 items-center">
          {actions || children}
        </div>
      )}
    </div>
  );
};

export default AdminPageHeader;
