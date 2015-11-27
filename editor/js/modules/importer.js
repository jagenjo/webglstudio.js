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

		DriveModule.addDropArea( gl.canvas, ImporterModule.onItemDrop.bind(this) );

		//triggered when a dropped file has been loaded and processed (used mostly to refresh stuff)
		LiteGUI.bind( gl.canvas, "file_dropped", function(evt, file) {
			//process resource (add to the library, attach to node, etc)
			ImporterModule.onResourceDropped(evt, evt.detail);
		});
	},

	/* Loads in memory the content of a File dropped from the Hard drive */
	onItemDrop: function (evt)
	{
		console.log("processing item drop...");

		//files
		var files = evt.dataTransfer.files;
		if(files)
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
				var format_info = LS.Formats.supported[ extension ];
				var format_type = "binary";
				if(format_info)
					format_type = format_info.format;

				if(format_type == "string" || format_type == "text" || format_type == "json" || format_type == "xml")
					reader.readAsText(file);
				else
					reader.readAsArrayBuffer(file);
				return true;
			}


		//drag something on the canvas
		//check if they are resources from other folder
		if( event.dataTransfer.getData("res-fullpath") )
		{
			var res_filename = event.dataTransfer.getData("res-filename");
			var res_fullpath = event.dataTransfer.getData("res-fullpath");
			var res_type = event.dataTransfer.getData("res-type");
			if(!res_fullpath)
				res_fullpath = event.dataTransfer.getData("text/uri-list");

			//if already has a fullpath (one with a unit...), could be a remote file or to move to other folder
			if(res_fullpath && res_fullpath.split("/").length > 1)
			{
				var res_info = LFS.parsePath(res_fullpath);
				console.log( res_fullpath );
				DriveModule.onInsertResourceInScene( { dataset: { restype: res_type, fullpath: res_fullpath}}, evt );
				return true;
			}
		}

		if( event.dataTransfer.getData("uid") )
		{
			GL.augmentEvent(event);
			var node = RenderModule.getNodeAtCanvasPosition( event.canvasx, event.canvasy );
			if(node)
				EditorModule.onDropOnNode( node, event );
		}

		return true;
	},

	//once FileReader has read the file from the HD...
	processFileDropped: function (e, file) { 
		console.log("File loaded in memory, processing: " + file.name);
		var data = e.target.result;

		//throw event: it will be get by onResourceDropped
		file.data = data;
		LiteGUI.trigger( gl.canvas, "file_dropped", file);
	},

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

		var target = LS.Material.COLOR_TEXTURE;
		var insert_into = false;
		var upload_file = false;
		var optimize_data = true;

		var node = LS.GlobalScene.selected_node;
		var mat = node ? node.getMaterial() : null;

		if( file )
		{
			var info = LS.Formats.getFileFormatInfo( file.name );
			if(info.type == LS.Formats.MESH_DATA )
			{
				widgets.addTitle("Mesh");
				widgets.addCheckbox("Optimize data", optimize_data, { callback: function(v) { optimize_data = v; }});
				//widgets.addCheckbox("Insert into scene", insert_into, { callback: function(v) { insert_into = v; }});
			}
			if(info.type == LS.Formats.IMAGE_DATA || info.type == LS.Formats.NONATIVE_IMAGE_DATA)
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
			if(info.type == LS.Formats.SCENE_DATA )
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
						EditorModule.inspect( selected_node );
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