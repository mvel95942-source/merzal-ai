# Merzal AI frontend — multi-stage build, served by nginx (on-prem ready).
# Vite bakes VITE_* envs at BUILD time, so they're passed as build args.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STUDENT_EMAIL_DOMAIN
# Brand (all optional — fall back to brand.ts defaults). VITE_BRAND_JSON_URL lets
# one image serve many tenants by fetching the brand JSON at runtime.
ARG VITE_BRAND_NAME
ARG VITE_BRAND_SHORT
ARG VITE_BRAND_INSTITUTION
ARG VITE_BRAND_LOGO_LETTER
ARG VITE_BRAND_ACCENT
ARG VITE_AUDIENCE
ARG VITE_BRAND_JSON_URL
ARG VITE_GEMINI_MODEL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_STUDENT_EMAIL_DOMAIN=$VITE_STUDENT_EMAIL_DOMAIN \
    VITE_BRAND_NAME=$VITE_BRAND_NAME \
    VITE_BRAND_SHORT=$VITE_BRAND_SHORT \
    VITE_BRAND_INSTITUTION=$VITE_BRAND_INSTITUTION \
    VITE_BRAND_LOGO_LETTER=$VITE_BRAND_LOGO_LETTER \
    VITE_BRAND_ACCENT=$VITE_BRAND_ACCENT \
    VITE_AUDIENCE=$VITE_AUDIENCE \
    VITE_BRAND_JSON_URL=$VITE_BRAND_JSON_URL \
    VITE_GEMINI_MODEL=$VITE_GEMINI_MODEL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
