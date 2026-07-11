namespace SharpOperationsProg.AAPublic.Operations;

public interface IVisit<T>
{
    public T Visit(
        string path);
}