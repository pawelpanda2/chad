using YamlDotNet.Core;
using YamlDotNet.Core.Events;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.EventEmitters;

namespace SharpOperationsProg.Operations.Yaml;

public class NullStringsAsEmptyEventEmitter : ChainedEventEmitter
{
    public NullStringsAsEmptyEventEmitter(IEventEmitter nextEmitter)
        : base(nextEmitter)
    {
    }

    public override void Emit(ScalarEventInfo eventInfo, IEmitter emitter)
    {
        if (eventInfo.Source.Type == typeof(string) && eventInfo.Source.Value == null)
        {
            emitter.Emit(new Scalar(string.Empty));
            return;
        }

        if (eventInfo.Source.Type == typeof(List<string>) && eventInfo.Source.Value == null)
        {
            emitter.Emit(new MappingStart());
            return;
        }

        base.Emit(eventInfo, emitter);
    }
}