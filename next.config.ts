import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,

  async redirects() {
    return [
      { source: "/protected", destination: "/inicio", permanent: true },
      { source: "/protected/home", destination: "/inicio", permanent: true },
      { source: "/protected/community", destination: "/comunidad", permanent: true },
      { source: "/protected/profile", destination: "/perfil", permanent: true },

      { source: "/protected/agenda", destination: "/agenda", permanent: true },
      { source: "/protected/pomodoro", destination: "/pomodoro", permanent: true },

      { source: "/protected/projects", destination: "/proyectos", permanent: true },
      { source: "/protected/projects/new", destination: "/proyectos/nuevo", permanent: true },
      { source: "/protected/projects/:projectId", destination: "/proyectos/:projectId", permanent: true },

      { source: "/protected/reports", destination: "/reportes", permanent: true },
      { source: "/protected/admin", destination: "/administracion", permanent: true },

      { source: "/protected/:path*", destination: "/inicio", permanent: false },
    ];
  },

  async rewrites() {
    return [
      { source: "/inicio", destination: "/protected/home" },
      { source: "/comunidad", destination: "/protected/community" },
      { source: "/perfil", destination: "/protected/profile" },

      { source: "/agenda", destination: "/protected/agenda" },
      { source: "/pomodoro", destination: "/protected/pomodoro" },

      { source: "/proyectos", destination: "/protected/projects" },
      { source: "/proyectos/nuevo", destination: "/protected/projects/new" },
      { source: "/proyectos/:projectId", destination: "/protected/projects/:projectId" },

      { source: "/reportes", destination: "/protected/reports" },
      { source: "/administracion", destination: "/protected/admin" },
    ];
  },
};

export default nextConfig;
