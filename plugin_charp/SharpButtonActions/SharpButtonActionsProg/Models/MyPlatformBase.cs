using System.Runtime.InteropServices;

namespace SharpButtonActionsProg.Models;

public class MyPlatformBase
{
    protected bool IsMyOsSystem(
        OSPlatform platform)
    {
        bool result = RuntimeInformation.IsOSPlatform(platform);
        return result;
    }
}
