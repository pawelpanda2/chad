using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudWrites;

public class DeleteWorker
{
    private readonly PathWorker pw;
    private readonly SystemWorker _sw;
    private readonly ConfigWorker _cw;
    private readonly BodyWorker _bw;
    private readonly ReadFolderWorker _rw;
    private readonly CustomOperationsService _customOperationsService;

    public DeleteWorker()
    {
        _rw = MyBorder.OutContainer.Resolve<ReadFolderWorker>();
        _bw = MyBorder.OutContainer.Resolve<BodyWorker>();
        _cw = MyBorder.OutContainer.Resolve<ConfigWorker>();
        _sw = MyBorder.OutContainer.Resolve<SystemWorker>();
        _customOperationsService = MyBorder.MyContainer.Resolve<CustomOperationsService>();
    }

    public void Delete(
        (string Repo, string Loca) adrTuple)
    {
    }
}