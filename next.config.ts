import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,

  async rewrites() {
    return [
      { source: "/", destination: "/protected" },

      // Secciones principales
      { source: "/inicio", destination: "/protected/home" },
      { source: "/comunidad", destination: "/protected/community" },
      { source: "/perfil", destination: "/protected/profile" },

      // Agenda / Pomodoro
      { source: "/agenda", destination: "/protected/agenda" },
      { source: "/pomodoro", destination: "/protected/pomodoro" },

      // Proyectos
      { source: "/proyectos", destination: "/protected/projects" },
      { source: "/proyectos/nuevo", destination: "/protected/projects/new" },
      { source: "/proyectos/:projectId", destination: "/protected/projects/:projectId" },

      // Reportes / Admin
      { source: "/reportes", destination: "/protected/reports" },
      { source: "/administracion", destination: "/protected/admin" },

      // Fallback
      { source: "/:path*", destination: "/protected/:path*" },
    ];
  },
};

export default nextConfig;
