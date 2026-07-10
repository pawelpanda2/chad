using System.Collections.Generic;

namespace SharpRepoServiceProg.Duplications.Operations.Files;

public interface IRepoAddressesObtainer
{
    List<string> Visit(string path);
}