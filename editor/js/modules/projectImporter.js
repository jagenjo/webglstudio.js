// This module allows to import a project from a hard drive and uploads it to the server
var ProjectImporter = {
	name: "ProjectImporter",

	init: function()
	{
		DriveModule.onImportToFolder = function(folder){ ProjectImporter.showImportDialog(folder); };
		LiteGUI.menubar.add("Project/Import", { callback: function() { ProjectImporter.showImportDialog(); }});
	},

	showImportDialog: function( folder, on_complete )
	{
		var that = this;
		folder = folder || "";
		var strip = true;
		var file = null;
		var info_widget = null;

		var dialog = new LiteGUI.Dialog( { title: "Import Projects", close: true, width: 1000, height: 450, scroll: false, resizable: true, minimize: true, draggable: true } );
		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["30%",null]);
		dialog.add(area);

		var inspector_left = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		inspector_left.addTitle("Import options");
		inspector_left.addString("From URL", "", { callback: function(v){
			console.log("changed");
		}});
		inspector_left.addFile("From File", "", { callback: function(v){
			file = v.file;
			info_widget.setValue("File size: " + file.size);
		}});
		info_widget = inspector_left.addInfo("Info","File not loaded");
		inspector_left.addSeparator();
		inspector_left.addFolder("Destination folder", folder, function(v){ folder = v; });
		inspector_left.addCheckbox("Strip folders", strip, function(v){ strip = v; });
		inspector_left.addSeparator();
		inspector_left.addButton(null,"Import project", function(){
			if(file)
				ProjectImporter.importFilesToFolder( file, on_complete );
			else
				LiteGUI.alert("File not loaded");
		});

		area.getSection(0).add( inspector_left );

		var console_area = area.getSection(1);
		var console = this.console;
		if(!console)
		{
			this.console = console = new LiteGUI.Console();
			this.console.root.style.fontSize = "0.8em";
		}
		console_area.add( console );
		//console.addMessage("");

		LiteGUI.createDropArea( dialog.root, function(evt){
			file = evt.dataTransfer.files[0];
			console.log("file dropped");
			info_widget.setValue("File size: " + file.size);
		});


		dialog.show();
	},

	//imports to memory
	importFilesToFolder: function( file, on_complete )
	{
		if(!window.JSZip)
		{
			LiteGUI.alert("JSZIP.js not found.");
			return;
		}

		if(!file)
			throw("file cannot be null");

		var files = [];

		var reader = new FileReader();
		reader.onload = function(e)
		{
			var zip = new JSZip();
			console.log("unziping data...");
			zip.loadAsync(e.target.result).then(function(zip) {
				 // you now have every files contained in the loaded zip
				zip.forEach(function (relativePath, file){
					//console.log("file in ZIP", relativePath );
					if(file.dir)
					{
					}
					else
					{
						var datatype = "arraybuffer";
						var extension = LS.RM.getExtension( file.name );
						var format_info = LS.Formats.supported[ extension ];
						if( format_info && format_info.dataType == "text" )
							datatype = "string";

						file.async( datatype ).then( (function (content)
						{
							var blob = new Blob([content],{type:"application/octet-stream"});
							blob.name = this.name;
							files.push( { file: blob, name: blob.name, content: content });
						}).bind(file) );
					}
				});
			}).then(function(){
				console.log("end");
				ProjectImporter.storeFiles( files, on_complete );
			});
		}
		console.log("reading zip data...");
		reader.readAsArrayBuffer( file );
	},

	storeFiles: function( files, on_complete )
	{
			console.log(files);
	},
};

CORE.registerModule( ProjectImporter );
