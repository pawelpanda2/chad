#!/bin/bash

echo "📦 Czyszczę wszystkie cache NuGet..."

echo "🗂️  Czyszczę global packages cache..."
dotnet nuget locals global-packages --clear

echo "📥 Czyszczę http cache..."
dotnet nuget locals http-cache --clear

echo "🔧 Czyszczę temp cache..."
dotnet nuget locals temp --clear

echo "🎯 Czyszczę plugins cache..."
dotnet nuget locals plugins-cache --clear

echo "📋 Lista źródeł NuGet:"
dotnet nuget list source

echo "🔍 Sprawdzam lokalizacje cache:"
dotnet nuget locals all --list

echo ""
echo "✅ Czyszczenie NuGet zakończone!"