//using SharpFileServiceProg.Service;
//using SharpRepoServiceProg.Names;
//using SharpRepoServiceProg.Registrations;
//using SharpRepoServiceProg.Workers;
//using System.Collections.Generic;
//using System.IO;
//using System.Linq;
//using static SharpFileServiceProg.Service.IFileService;

//namespace SharpRepoServiceProg.WorkersSystem
//{
//    internal class Temp
//    {
//        public List<string> ReposPathsList { get; private set; }
//        private string slash = "/";
//        private char newLine = '\n';
//        private PathWorker pw;
//        private ReadWorker iw;
//        private readonly IOperationsService operationsService;
//        private readonly IYamlOperations yamlOperations;

//        public Temp(
//            IOperationsService operationsService)
//        {
//            this.operationsService = operationsService;
//            yamlOperations = operationsService.Yaml.Custom03;

//            pw = MyBorder.Container.Resolve<PathWorker>();
//            iw = MyBorder.Container.Resolve<ReadWorker>();
//        }

//        public void CreateBody(
//            (string Repo, string Loca) adrTuple,
//            string content)
//        {
//            var filePath = pw.GetBodyPath(adrTuple);
//            File.WriteAllText(filePath, content);

//            //var topSpace = GetTopSpace();
//            //File.WriteAllText(contentFilePath, topSpace + content);
//        }

//        public string GetTopSpace()
//        {
//            //var result = string.Join("", Enumerable.Repeat(newLine, 4));
//            var result = "";
//            return result;
//        }

//        private void AppendTextGenerate(
//            (string Repo, string Loca) address,
//            string content)
//        {
//            var elemPath = pw.GetItemPath(address);

//            var contentFilePath = pw.GetBodyPath(address);
//            var oldContent = GetText2(address);
//            var newContent = oldContent + newLine + content;
//            File.WriteAllText(contentFilePath, newContent);
//        }

//        //public string GetText2((string Repo, string Loca) address)
//        //{
//        //    // ReadText
//        //    var path = GetElemPath(address) + "/" + contentFileName;
//        //    var lines = File.ReadAllLines(path);
//        //    var content = string.Join(newLine, lines);
//        //    return content;
//        //}

//        public List<string> GetMynyTextByName(
//            (string Repo, string Loca) adrTuple,
//            string name)
//        {
//            var newAdrTuple = pw.GetAdrTupleByName(adrTuple, name);
//            var contentsList = GetManyText(newAdrTuple);

//            return contentsList;
//        }



        

        

       
//    }
//}