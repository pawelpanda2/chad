namespace SharpFileServiceProg.AAPublic;

public interface IVisit<T>
{
    public T Visit(
        string path);
}