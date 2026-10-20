#requires -Version 5.1
<# Read-only control-plane supplement. Sensitive JSON is DPAPI SecureString,
never a plaintext file. Does not capture another DB backup or change Auth.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows, no arguments required.'}
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Reviewed helpers unavailable.'}
foreach($name in @('Assert-NoReparsePath','Assert-LocalOnlyDestination','Assert-PrivateAcl','Set-PrivateAcl')){
    $functions=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
    if($functions.Count -ne 1){throw 'Reviewed helper unavailable.'}
    . ([scriptblock]::Create($functions[0].Extent.Text))
}
$record=$null;$pat=$null;$headers=$null;$payload=$null;$securePayload=$null;$verified=$null
$stream=$null;$created=$false;$destination=$null;$payloadBytes=$null
try{
    $ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if($ownerSid.Value -eq 'S-1-5-18'){throw 'Named custodian required.'}
    $localData=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if([string]::IsNullOrWhiteSpace($localData)){throw 'Local data unavailable.'}
    Assert-LocalOnlyDestination $localData
    $app=Join-Path $localData 'GestorBarberia'
    $secretDirectory=Join-Path $app 'secrets'
    $backupDirectory=Join-Path $app 'backups\stage04-ab70bce0fa53469f8f8659c4564970ba'
    $tokenPath=Join-Path $secretDirectory 'stage04-management-token.clixml'
    foreach($path in @($app,$secretDirectory,$backupDirectory,$tokenPath)){
        Assert-NoReparsePath $path
        Assert-PrivateAcl -LiteralPath $path -OwnerSid $ownerSid
    }
    $record=Import-Clixml -LiteralPath $tokenPath
    if($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]){throw 'Token record rejected.'}
    $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
    $headers=@{Authorization=('Bearer '+$pat)}
    $base='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
    $project=Invoke-RestMethod -Method Get -Uri $base -Headers $headers -TimeoutSec 30
    if($project.id -cne 'ucmwykzrepmjucssjnum'){throw 'Project mismatch.'}
    $auth=Invoke-RestMethod -Method Get -Uri ($base+'/config/auth') -Headers $headers -TimeoutSec 30
    $observedUtc=[DateTime]::UtcNow.ToString('o')
    $payload=([ordered]@{Project=$project;AuthConfig=$auth;ObservedUtc=$observedUtc}|ConvertTo-Json -Depth 32 -Compress)
    $payloadBytes=[Text.Encoding]::UTF8.GetBytes($payload)
    if($payloadBytes.Length -gt 1048576){throw 'Unexpected configuration size.'}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$payloadHash=([BitConverter]::ToString($sha.ComputeHash($payloadBytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    $securePayload=ConvertTo-SecureString $payload -AsPlainText -Force
    $supplementId=[Guid]::NewGuid().ToString('N')
    $destination=Join-Path $backupDirectory ('auth-config-'+$supplementId+'.clixml')
    Assert-NoReparsePath $destination
    $stream=[IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $created=$true;$stream.Dispose();$stream=$null
    Set-PrivateAcl -LiteralPath $destination -IsDirectory $false -OwnerSid $ownerSid
    [pscustomobject]@{
        FormatVersion=1;ProjectRef='ucmwykzrepmjucssjnum';SupplementId=$supplementId
        BackupId='ab70bce0fa53469f8f8659c4564970ba';ObservedUtc=$observedUtc
        Capture='read_only_project_and_auth_config_post_database_capture'
        Cipher='Windows current-user DPAPI SecureString';PayloadSha256=$payloadHash
        PayloadBytes=$payloadBytes.Length;Payload=$securePayload
        SameSnapshotAsDatabase=$false;ConfigurationRestoreVerified=$false
    }|Export-Clixml -LiteralPath $destination -Depth 4
    Assert-PrivateAcl -LiteralPath $destination -OwnerSid $ownerSid
    $verified=Import-Clixml -LiteralPath $destination
    if($verified.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $verified.SupplementId -cne $supplementId -or
        $verified.Payload -isnot [Security.SecureString] -or $verified.Payload.Length -ne $securePayload.Length -or
        $verified.PayloadSha256 -cne $payloadHash){throw 'Encrypted supplement verification failed.'}
    $created=$false
    Write-Output ([pscustomobject]@{SupplementId=$supplementId;ObservedUtc=$observedUtc;EncryptedFile=$destination;PayloadBytes=$payloadBytes.Length;PayloadSha256=$payloadHash;RemoteModified=$false;RestoreVerified=$false}|ConvertTo-Json -Compress)
}catch{
    if($null -ne $stream){$stream.Dispose();$stream=$null}
    if($created -and $null -ne $destination){try{Assert-NoReparsePath $destination;[IO.File]::Delete($destination)}catch{Write-Warning 'Incomplete encrypted supplement may need local cleanup.'}}
    throw 'Read-only configuration capture stopped; raw response suppressed. No remote changes were made.'
}finally{
    if($null -ne $stream){$stream.Dispose()}
    if($null -ne $record -and $record.Token -is [Security.SecureString]){$record.Token.Dispose()}
    if($null -ne $securePayload){$securePayload.Dispose()}
    if($null -ne $verified -and $verified.Payload -is [Security.SecureString]){$verified.Payload.Dispose()}
    if($null -ne $payloadBytes){[Array]::Clear($payloadBytes,0,$payloadBytes.Length)}
    $record=$null;$pat=$null;$headers=$null;$payload=$null;$project=$null;$auth=$null;$verified=$null
}
