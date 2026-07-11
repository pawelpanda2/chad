using SharpFileServiceProg.Service;

namespace SharpFileServiceProg.AAPublic;

public class OutBorder
{
    public static IFileService FileService()
    {
        return new FileService();
    }
}