/* 
	It handles importing new models and textures from DISK or internet, parsing them and store them.
	It allows to save them locally or add them to the Resources Database.
*/

var ImporterModule  = {
	name: "importer",

	//settings_panel: [ {name:"importer", title:"Importer", icon:null } ],

	skip_import_dialog: false,

	init: function()
	{
		//attributes.addButton("Save to BIN", true, { callback: function() { EditorModule.saveToDisk(node,true); }});
		//LiteGUI.menubar.add("Scene/Import resource", { callback: function() { ImporterModule.showImportResourceDialog();} });

		this.addFileDropArea( document.body, ImporterModule.onFileDrop.bind(this) );
	},

	addFileDropArea: function( dropbox, callback )
	{
		dropbox.addEventListener("dragenter", onDragEvent, false);

		function onDragEvent(evt)
		{
			dropbox.addEventListener("dragexit", onDragEvent, false);
			dropbox.addEventListener("dragover", onDragEvent, false);
			dropbox.addEventListener("drop", onDrop, false);
			evt.stopPropagation();
			evt.preventDefault();
			/*
			for(var i in evt.dataTransfer.types)
				if(evt.dataTransfer.types[i] == "Files")
				{
					if(evt.type != "dragover")
						console.log("Drag event: " + evt.type);
					evt.stopPropagation();
					evt.preventDefault();

					dropbox.addEventListener("dragexit", onDragEvent, false);
					dropbox.addEventListener("dragover", onDragEvent, false);
					dropbox.addEventListener("drop", onDrop, false);
				}
			*/
		}

		function onDrop(evt)
		{
			evt.stopPropagation();
			evt.preventDefault();

			dropbox.removeEventListener("dragexit", onDragEvent, false);
			dropbox.removeEventListener("dragover", onDragEvent, false);
			dropbox.removeEventListener("drop", onDrop, false);

			var r = undefined;
			//load file in memory
			if(callback)
				r = callback(evt);

			if (r === false)
				ImporterModule.onFileDrop(evt);
		}

		//triggered when a dropped file has been loaded and processed (used mostly to refresh stuff)
		$(this).bind("file_dropped", function(evt, file) {
			//process resource (add to the library, attach to node, etc)
			ImporterModule.onResourceDropped(evt, file);
		});
	},

	/* Loads in memory the content of a File dropped from the Hard drive */
	onFileDrop: function (evt)
	{
		console.log("processing filedrop...");

		var files = evt.dataTransfer.files;
		var count = files.length;
		
		for(var i=0; i < files.length; i++)
		{
			var file = files[i];
			
			var reader = new FileReader();
			reader.onload = (function(theFile) {
				return function(e) {
					try
					{
						ImporterModule.processFileDropped(e, theFile);
					}
					catch (err)
					{
						trace("Error processing data: " + err);
					}
				};
			})(file);

			var extension = LS.ResourcesManager.getExtension( file.name );
			var format_type = LS.ResourcesManager.formats[extension];
			if(!format_type)
				format_type = "binary";

			if(format_type == "text" || format_type == "json" || format_type == "xml")
				reader.readAsText(file);
			else
				reader.readAsArrayBuffer(file);
		}

		$("#content").removeClass("highlight");
		return true;
	},

	//once FileReader has read the file from the HD...
	processFileDropped: function (e, file) { 
		trace("File loaded: " + file.name);
		var data = e.target.result;

		//throw event: it will be get by onResourceDropped
		file.data = data;
		$(this).trigger("file_dropped", file);
	},

	/*
	saveToDisk: function(node,binary)
	{
		if(node == null || node.mesh == null) return;

		//var data = JSON.stringify( selected_node.mesh.info,"Mesh JS Code");
		var data = null;
		var extension = ".js";
		var dataType = 'string';
		var mesh = ResourcesManager.meshes[node.mesh];

		if(!mesh)return;

		if(binary)
		{
			data = mesh.toBinary();
			data = encode64Array(data);
			dataType = 'base64';
			extension = ".bin";
		}
		else //json
		{
			var o = {};
			o.vertices = typedArrayToArray( mesh.vertices );
			if(mesh.normals) o.normals = typedArrayToArray( mesh.normals );
			if(mesh.coords) o.coords = typedArrayToArray( mesh.coords );
			if(mesh.colors) o.colors = typedArrayToArray( mesh.colors );
			if(mesh.triangles) o.triangles = typedArrayToArray( mesh.triangles );
			o.info = mesh.info;
			data = JSON.stringify(o);
		}

		var f = mesh.info.filename;
		if(f == null)
			f = mesh.name;
		var end = f.lastIndexOf(".");
		var start = f.lastIndexOf("/",end);
		var filename = f.substr(start+1,end-start-1);
		filename += extension;

		LiteGUI.showMessage("<p>Click the button to save the file as a JSON object.</p><p id='downloadify'>You must have Flash 10 installed to download this file</p>",{close:1});

		$("#downloadify").downloadify({
			filename: filename,
			data: data,
			dataType: dataType,
			onComplete: function(){ LiteGUI.showMessage("<p>Saved!</p>"); },
			onCancel: function(){  },
			onError: function(){ LiteGUI.showMessage("Error saving, file empty?",{close:1}); },
			transparent: false,
			swf: 'media/downloadify.swf',
			downloadImage: 'media/download.png',
			width: 100,
			height: 30,
			transparent: true,
			append: false
		});

		function inner_end()
		{
			$("#messagebox").hide();
		}
	},
	*/

	/* called when the file from HardDrive is loaded in memory (after being dropped) */
	onResourceDropped: function(e, file)
	{
		/*
		if(ImporterModule.skip_import_dialog)
		{
			var res = ImporterModule.processFileContent(e,file);
			if(res.filename) filename = res.filename;
			EditorModule.createNodeWithMesh(filename);
			return;
		}
		*/

		ImporterModule.showImportResourceDialog( file );
	},

	showImportResourceDialog: function(file, options)
	{
		options = options || {};

		var dialog = new LiteGUI.Dialog("dialog_import_resource", {title:"Import Resource", close: true, minimize: true, width: 360, height: 240, scroll: false, draggable: true});
		dialog.show();

		var widgets = new LiteGUI.Inspector("import_widgets",{ name_width: "50%" });
		widgets.addString("Name", file ? file.name : "");
		widgets.addString("Filename", file ? file.name : "");

		var target = Material.COLOR_TEXTURE;
		var insert_into = false;
		var upload_file = false;
		var optimize_data = true;

		var node = Scene.selected_node;
		var mat = node ? node.getMaterial() : null;

		if( file )
		{
			var info = Parser.getFileFormatInfo( file.name );
			if(info.type == Parser.MESH_DATA )
			{
				widgets.addTitle("Mesh");
				widgets.addCheckbox("Optimize data", optimize_data, { callback: function(v) { optimize_data = v; }});
				//widgets.addCheckbox("Insert into scene", insert_into, { callback: function(v) { insert_into = v; }});
			}
			if(info.type == Parser.IMAGE_DATA || info.type == Parser.NONATIVE_IMAGE_DATA)
			{
				widgets.addTitle("Texture");
				widgets.addCheckbox("Add to selected node", insert_into, { callback: function(v) { insert_into = v; }});
				if(mat)
				{
					var channels = mat.getTextureChannels();
					target = channels[0];
					widgets.addCombo("Channel", target, { values: channels, callback: function(v) { 
						target = v;
					}});
				}
				widgets.addCheckbox("Optimize data", optimize_data, { callback: function(v) { optimize_data = v; }});
			}
			if(info.type == Parser.SCENE_DATA )
			{
				widgets.addTitle("Scene");
				widgets.addCheckbox("Optimize data", optimize_data, { callback: function(v) { optimize_data = v; }});
			}

		}

		dialog.addButton("Import", { className: "big", callback: inner_import });
		var imp_and_upload = dialog.addButton("Import & Upload", { className: "big", callback: inner_import });
		var imp_and_insert = dialog.addButton("Import and Insert", { className: "big", callback: inner_import });
		dialog.addButton("Cancel", { className: "big", callback: function() { dialog.close(); } });

		dialog.add(widgets);

		var filename = "";

		function inner_import(button, callback)
		{
			if(button == imp_and_insert)
				insert_into = true;
			if(button == imp_and_upload)
				upload_file = true;

			var name = widgets.getValue("Name");
			filename = widgets.getValue("Filename");
			filename = filename.replace(/ /g,"_"); //no spaces in names			

			options.optimize_data = optimize_data;
			options.filename = filename;
			options.target = target; //if its texture
			file.filename = filename;

			ImporterModule.processResource(name, file, options, inner_processed);
			dialog.close();
		}

		function inner_processed(filename, resource, options)
		{
			if(resource.filename)
				filename = resource.filename;
			if(insert_into)
			{
				if(resource.constructor == GL.Mesh)
					EditorModule.createNodeWithMesh(filename);
				else if(resource.constructor == GL.Texture)
				{
					var selected_node = SelectionModule.getSelectedNode();
					if(selected_node)
					{
						var mat = selected_node.getMaterial();
						if(!mat)
						{
							mat = new LS.StandardMaterial();
							selected_node.material = mat;
						}
						mat.setTexture( target, resource.filename );
						LEvent.trigger( selected_node, "changed" );
						EditorModule.inspectNode( selected_node );
					}
				}
				else if(resource.constructor == LS.SceneTree)
				{
					LS.GlobalScene.configure( resource.serialize() );
				}
			}

			if(upload_file)
			{
				DriveModule.showSelectFolderDialog( function(folder) {
					if(!folder) return;
					if(!resource.filename) return;
					DriveModule.uploadAndShowProgress( resource, folder );
				});
			}
			dialog.close();
		}
	},

	// Called when the user decides to import the resource after clicking Import in the dialog
	// This function is called when the resource is loaded (async due to img.onload) 
	// It has to create the resource from the file and call the callback
	processResource: function (name, file, options, on_complete)
	{ 
		options = options || {};

		var filename = options.filename || file.name;
		var resource = LS.ResourcesManager.processResource(filename, file.data, options, inner);

		return null;

		function inner(filename, resource)
		{
			if(resource)
			{
				if(options.optimize_data && resource.constructor == Mesh)
				{
					resource._original_data = resource.toBinary().buffer; //ArrayBuffer
					filename = filename + ".wbin";

					LS.ResourcesManager.renameResource( resource.filename, filename );
				}
				else
					resource._original_file = file;
			}

			if(on_complete)
				on_complete(filename, resource);
		}
	},
};

CORE.registerModule( ImporterModule );