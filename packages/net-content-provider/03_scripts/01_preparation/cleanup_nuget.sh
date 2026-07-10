#!/bin/bash

echo "📦 Rozpoczynam czyszczenie NuGet cache..."

echo "🗂️  Czyszczę global packages cache..."
dotnet nuget locals global-packages --clear

echo "📥 Czyszczę http cache..."
dotnet nuget locals http-cache --clear

echo "🔧 Czyszczę temp cache..."
dotnet nuget locals temp --clear

echo "🎯 Czyszczę plugins cache..."
dotnet nuget locals plugins-cache --clear

echo "🧹 Czyszczę wszystkie cache jednocześnie..."
dotnet nuget locals all --clear

echo ""
echo "📋 Lista źródeł NuGet:"
dotnet nuget list source

echo ""
echo "🔍 Lokalizacje cache po czyszczeniu:"
dotnet nuget locals all --list

echo ""
echo "✅ Czyszczenie NuGet cache zakończone!"
echo "💡 Następny 'dotnet restore' pobierze świeże pakiety"