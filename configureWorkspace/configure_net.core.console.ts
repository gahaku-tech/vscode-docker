/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as semver from 'semver';
import { extractRegExGroups } from '../helpers/a';
import { OS, Platform } from './config-utils';
import { PackageInfo } from './configure';

export let configureDotNetCoreConsole = {
  genDockerFile,
  genDockerCompose: undefined, // We don't generate compose files for .net core
  genDockerComposeDebug: undefined // We don't generate compose files for .net core
};

const AspNetCoreRuntimeImageFormat = "microsoft/aspnetcore:{0}.{1}{2}";
const AspNetCoreSdkImageFormat = "microsoft/aspnetcore-build:{0}.{1}{2}";
const DotNetCoreRuntimeImageFormat = "microsoft/dotnet:{0}.{1}-runtime{2}";
const DotNetCoreAspNetRuntimeImageFormat = "microsoft/dotnet:{0}.{1}-aspnetcore-runtime{2}";
const DotNetCoreSdkImageFormat = "microsoft/dotnet:{0}.{1}-sdk{2}";

function GetWindowsImageTag(): string {
  // Windows 10 RS4 or newer
  return "-nanoserver-1803";
}

function formatVersion(format: string, version: string, tagForWindowsVersion: string): string {
  let asSemVer = new semver.SemVer(version);
  return format.replace('{0}', asSemVer.major.toString())
    .replace('{1}', asSemVer.minor.toString())
    .replace('{2}', tagForWindowsVersion);
}

// AT-DockerCore: /src/Microsoft.Docker/Templates/windows/dotnetcore/aspnetcore/Dockerfile
const aspNetCoreTemplate = `#Depending on the operating system of the host machines(s) that will build or run the containers, the image specified in the FROM statement may need to be changed.
#For more information, please see http://aka.ms/containercompat

FROM $base_image_name$ AS base
WORKDIR /app
$expose_statements$

FROM $sdk_image_name$ AS build
WORKDIR /src
$copy_project_commands$
RUN dotnet restore $container_project_directory$/$project_file_name$
COPY . .
WORKDIR /src/$container_project_directory$
RUN dotnet build $project_file_name$ -c Release -o /app

FROM build AS publish
RUN dotnet publish $project_file_name$ -c Release -o /app

FROM base AS final
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "$assembly_name$.dll"]
`;

// AT-DockerCore: /src/Microsoft.Docker/Templates/windows/dotnetcore/console/Dockerfile
const aspNetCoreTemplate = ``;

// Note: serviceName includes the path of the service relative to the generated file, e.g. 'projectFolder1/myAspNetService'
function genDockerFile(serviceName: string, platform: Platform, os: OS | undefined, port: string, { cmd, author, version, artifactName, csProjFileContents }: Partial<PackageInfo>): string {

  // VS version is in ResolveImageNames (src/Docker/Microsoft.VisualStudio.Docker.DotNetCore/DockerDotNetCoreScaffoldingProvider.cs)

  // Example:
  // <TargetFramework>netcoreapp1.0</TargetFramework>
  //
  const defaultNetCoreVersion = '2.1';
  let [netCoreAppVersion] = extractRegExGroups(csProjFileContents, /<TargetFramework>netcoreapp([0-9.]+)<\/TargetFramework/, [defaultNetCoreVersion]);

  let baseImageFormat: string;
  let sdkImageNameFormat: string;

  if (platform === 'ASP.NET Core') {
    if (netCoreAppVersion < '2.1') {
      baseImageFormat = AspNetCoreRuntimeImageFormat;
      sdkImageNameFormat = AspNetCoreSdkImageFormat;
    } else {
      baseImageFormat = DotNetCoreAspNetRuntimeImageFormat;
      sdkImageNameFormat = DotNetCoreSdkImageFormat;
    }
  } else {
    baseImageFormat = DotNetCoreRuntimeImageFormat;
    sdkImageNameFormat = DotNetCoreSdkImageFormat;
  }

  // When targeting Linux container or the dotnet core version is less than 2.0, use MA tag.
  // Otherwise, use specific nanoserver tags depending on Windows build.
  let tagForWindowsVersion: string = '';
  if (os === 'Windows' && semver.lt(netCoreAppVersion, '2.0')) {
    tagForWindowsVersion = GetWindowsImageTag();
  }

  let baseImageName = formatVersion(baseImageFormat, netCoreAppVersion, tagForWindowsVersion);
  let sdkImageName = formatVersion(sdkImageNameFormat, netCoreAppVersion, tagForWindowsVersion);

  if (os.toLowerCase() === 'windows') {

    return `#Depending on the operating system of the host machines(s) that will build or run the containers, the image specified in the FROM statement may need to be changed.
#For more information, please see http://aka.ms/containercompat

FROM microsoft/dotnet:2.0-runtime-nanoserver-1709 AS base
WORKDIR /app

FROM microsoft/dotnet:2.0-sdk-nanoserver-1709 AS build
WORKDIR /src
COPY ${serviceName}.csproj ${serviceName}/
RUN dotnet restore ${serviceName}/${serviceName}.csproj
WORKDIR /src/${serviceName}
COPY . .
RUN dotnet build ${serviceName}.csproj -c Release -o /app

FROM build AS publish
RUN dotnet publish ${serviceName}.csproj -c Release -o /app

FROM base AS final
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "${serviceName}.dll"]
`;

  } else {

    assert(os.toLowerCase() === 'linux');
    return `FROM microsoft/dotnet:2.0-runtime AS base
WORKDIR /app

FROM microsoft/dotnet:2.0-sdk AS build
WORKDIR /src
COPY ${serviceName}.csproj ${serviceName}/
RUN dotnet restore ${serviceName}/${serviceName}.csproj
WORKDIR /src/${serviceName}
COPY . .
RUN dotnet build ${serviceName}.csproj -c Release -o /app

FROM build AS publish
RUN dotnet publish ${serviceName}.csproj -c Release -o /app

FROM base AS final
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "${serviceName}.dll"]
`;

  }
}
