// using System.Reflection;
// using StringArgsResolver;
// using SharpArgsManagerProg.AAPublic;
// using SharpArgsManagerProj;
// using SharpGameSynchProg.Service;
//
// namespace SharpArgsManagerProg.Scripts;
//
// public class ScriptForGameActive : IScriptForGameActive, IScriptDecorator
// {
//     private GameSynchService _gameSynch;
//     private readonly string[] _myMethods;
//
//     public ScriptForGameActive()
//     {
//         _gameSynch = MyBorder.OutContainer
//             .Resolve<GameSynchService>();
//         _myMethods =
//         [
//             nameof(GameSynchService)
//         ];
//     }
//
//     public bool Resolve(string[] args)
//     {
//         string methodName = args[1];
//         string foundMethod = _myMethods.SingleOrDefault(methodName);
//         {
//             object[] arguments = [args]; 
//             GetType().InvokeMember(foundMethod, BindingFlags.InvokeMethod | BindingFlags.Instance | BindingFlags.Public, null, this, arguments);
//             return true;
//         }
//     }
//
//     public void GameSynchService(string[] args)
//     {
//         int year = int.Parse(args[2]);
//         _gameSynch.Sync(year);
//     }
// }
