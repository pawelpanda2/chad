# Stage 1: Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src

# restore
COPY ["ServerRenderingApp/ServerRenderingApp.csproj", "ServerRenderingApp/"]
RUN dotnet restore 'ServerRenderingApp/ServerRenderingApp.csproj'

# build
COPY ["ServerRenderingApp", "ServerRenderingApp/"]
WORKDIR /src/ServerRenderingApp
RUN dotnet build 'ServerRenderingApp.csproj' -c Release -o /app/build

# Stage 2: Publish Stage
FROM build AS publish
WORKDIR /src/ServerRenderingApp
RUN dotnet publish 'ServerRenderingApp.csproj' -c Release -o /app/publish

# Stage 3: Run Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS run
ENV ASPNETCORE_HTTP_PORTS=5001
EXPOSE 5001
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT [ "dotnet", "ServerRenderingApp.dll" ]
