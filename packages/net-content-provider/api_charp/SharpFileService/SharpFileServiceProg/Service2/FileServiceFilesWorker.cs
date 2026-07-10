namespace SharpFileServiceProg.Service2;

public partial class FileService2
{
    public class FileServiceFilesWorker
    {
        public bool Exists(string path)
        {
            return FileExists(path) || DirectoryExists(path);
        }

        public bool FileExists(string path)
        {
            return File.Exists(path);
        }

        public bool DirectoryExists(string path)
        {
            return Directory.Exists(path);
        }

        public void CreateDirectory(string directoryPath)
        {
            if (Exists(directoryPath))
            {
                throw new Exception();
            }

            try
            {
                Directory.CreateDirectory(directoryPath);
            }
            catch
            {
                throw new Exception();
            }
        }
        public void CopyDirectory(string sourceDirectoryPath, string destinationDirectoryPath)
        {
            if (!Exists(sourceDirectoryPath))
            {
                throw new Exception();
            }

            if (!Exists(destinationDirectoryPath))
            {
                CreateDirectory(destinationDirectoryPath);
            }

            try
            {
                foreach (var file in GetFilesFromDirectory(sourceDirectoryPath).Select(x => new FileInfo(x)))
                {
                    CopyFile(file.FullName, Path.Combine(destinationDirectoryPath, file.Name));
                }

                foreach (var directory in Directory.GetDirectories(sourceDirectoryPath).Select(x => new DirectoryInfo(x)))
                {
                    CopyDirectory(directory.FullName, Path.Combine(destinationDirectoryPath, directory.Name));
                }
            }
            catch (Exception exception)
            {
                throw exception;
            }
        }

        public void CopyFile(string sourceFilePath, string destinationFilePath, bool overwriteExistingFile)
        {
            if (Path.GetFullPath(sourceFilePath).Equals(Path.GetFullPath(destinationFilePath), StringComparison.InvariantCultureIgnoreCase))
            {
                return;
            }

            try
            {
                File.Copy(sourceFilePath, destinationFilePath, overwriteExistingFile);
            }
            catch (Exception exception)
            {
                if (exception is FileNotFoundException)
                {
                    throw new Exception();
                }

                throw new Exception();
            }
        }

        public void Copy(string sourceDirectory, string targetDirectory)
        {
            var diSource = new DirectoryInfo(sourceDirectory);
            var diTarget = new DirectoryInfo(targetDirectory);

            CopyAll(diSource, diTarget);
        }

        private void CopyAll(DirectoryInfo source, DirectoryInfo target)
        {
            Directory.CreateDirectory(target.FullName);

            // Copy each file into the new directory.
            foreach (FileInfo fi in source.GetFiles())
            {
                Console.WriteLine(@"Copying {0}\{1}", target.FullName, fi.Name);
                fi.CopyTo(Path.Combine(target.FullName, fi.Name), true);
            }

            // Copy each subdirectory using recursion.
            var directories = source.GetDirectories();

            foreach (DirectoryInfo diSourceSubDir in directories)
            {
                if (diSourceSubDir.Name != "Temp")
                {
                    DirectoryInfo nextTargetSubDir =
                        target.CreateSubdirectory(diSourceSubDir.Name);
                    CopyAll(diSourceSubDir, nextTargetSubDir);
                }

            }
        }

        public IEnumerable<string> GetFilesFromDirectory(string directoryPath)
        {
            return GetFilesFromDirectory(directoryPath, "*");
        }

        public IEnumerable<string> GetFilesFromDirectory(string directoryPath, string searchPattern)
        {
            return GetFilesFromDirectory(directoryPath, searchPattern, false);
        }

        private IEnumerable<string> GetFilesFromDirectory(string directoryPath, string searchPattern, bool v)
        {
            return Directory.GetFiles(directoryPath, searchPattern);
        }

        public void CopyFile(string sourceFilePath, string destinationFilePath)
        {
            CopyFile(sourceFilePath, destinationFilePath, false);
        }
    }
}