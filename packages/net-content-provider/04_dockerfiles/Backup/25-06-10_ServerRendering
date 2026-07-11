# Stage 1: Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src

# restore
COPY 01_database 01_database/
COPY 02_settings 02_settings/
COPY 03_projects 03_projects/
COPY 04_registrations 04_registrations/
COPY 05_projects 05_projects/
RUN dotnet restore '05_projects/PublicServerRendering/PublicServerRendering.csproj'

# build
WORKDIR /src/05_projects/PublicServerRendering
RUN dotnet build 'PublicServerRendering.csproj' -c Release -o /app/build

# Stage 2: Publish Stage
FROM build AS publish
WORKDIR /src/05_projects/PublicServerRendering
RUN dotnet publish 'PublicServerRendering.csproj' -c Release -o /app/publish

# Stage 3: Run Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS run
ENV ASPNETCORE_HTTP_PORTS=5001
EXPOSE 5001
WORKDIR /app
COPY --from=publish /app/publish .
COPY 02_settings /app/02_settings/
COPY 01_database /app/01_database/
ENTRYPOINT [ "dotnet", "PublicServerRendering.dll" ]
