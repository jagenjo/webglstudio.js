/* 
	It handles importing new models and textures from DISK or internet, parsing them and store them.
	It allows to save them locally or add them to the Resources Database.
*/

var ImporterModule  = {

	name: "importer",
	
	//this are saved between sessions
	preferences: {
		optimize_data: false,
		mesh_action: "origin",
		texture_action: "replace",
		use_names_to_reference: true
	},

	init: function()
	{
		if(window.gl && window.gl.canvas )
			LiteGUI.createDropArea( gl.canvas, ImporterModule.onItemDrop.bind(this) );
		LiteGUI.menubar.add("Actions/Import File", { callback: function() { ImporterModule.showImportResourceDialog(); }});
	},

	// Launched when something is drag&drop inside the canvas (could be files, links, or elements of the interface) 
	onItemDrop: function (evt, options)
	{
		var that = this;
		options = options || {};
		console.log("processing item drop...");

		//compute on top of which node it was dropped
		GL.augmentEvent( evt );
		var node = null;
		if(evt.canvasx !== undefined ) //canvas drop
			node = RenderModule.getNodeAtCanvasPosition( evt.canvasx, evt.canvasy );
	
		options.node = node;
		options.event = evt;

		//files
		var files = evt.dataTransfer.files;
		if(files && files.length)
		{
			//more than one file
			if(files.length > 1)
			{

				//sort resources so images goes first?
				var files = ImporterModule.sortFilesByPriority( files );

				//TODO: show special dialog?
				for(var i=0; i < files.length; i++)
				{
					this.loadFileToMemory( files[i], function(file,options){
						var filename = file.name.toLowerCase();
						NotifyModule.show("FILE: " + file.name, { id: "res-msg-" + file.name.hashCode(), closable: true, time: 3000, left: 60, top: 30, parent: "#visor" } );
						ImporterModule.processResource( file.name, file, that.getImporterOptions( file.name ), function(filename, resource){
							//meshes must be inserted
							if(resource.constructor === GL.Mesh)
								ImporterModule.insertMeshInScene( resource );
						});
					},options);


				}
				return;
			}

			//one single file
			var file = files[0];
			this.loadFileToMemory( file, this.showImportResourceDialog.bind(this), options );
			return true;
		}

		//drag something on the canvas
		//check if they are resources from other folder
		if( evt.dataTransfer.getData("res-fullpath") )
		{
			var res_filename = evt.dataTransfer.getData("res-filename");
			var res_fullpath = evt.dataTransfer.getData("res-fullpath");
			var res_type = evt.dataTransfer.getData("res-type");
			if(!res_fullpath)
				res_fullpath = evt.dataTransfer.getData("text/uri-list");

			//if already has a fullpath (one with a unit...), could be a remote file or to move to other folder
			if(res_fullpath && res_fullpath.split("/").length > 1)
			{
				var res_info = LFS.parsePath(res_fullpath);
				console.log( res_fullpath );
				DriveModule.onInsertResourceInScene( { dataset: { restype: res_type, fullpath: res_fullpath } }, options );
				return true;
			}
		}

		//dragging component or node
		if( evt.dataTransfer.getData("uid") )
		{
			GL.augmentEvent(evt);
			var node = RenderModule.getNodeAtCanvasPosition( evt.canvasx, evt.canvasy );
			if(node)
				EditorModule.onDropOnNode( node, evt );
			return true; //dragging node and not inside a component
		}

		if( evt.dataTransfer.getData("text/uri-list") )
		{
			GL.augmentEvent(evt);
			var node = RenderModule.getNodeAtCanvasPosition( evt.canvasx, evt.canvasy );
			var url = evt.dataTransfer.getData("text/uri-list");
			var filename = DriveModule.getFilename(url);
			ImporterModule.showImportResourceDialog({name:filename,url:url}, {node: node});
		}

		return true;
	},

	//just guesses the type and loads it into memory
	loadFileToMemory: function(file, callback, options)
	{
		if(!file)
			return;

		var reader = new FileReader();
		reader.onload = function(e) {
			try
			{
				file.data = e.target.result;
				if(callback)
					callback(file,options);
			}
			catch (err)
			{
				console.log("Error processing data: " + err);
			}
		};
		reader.onerror = function(err)
		{
			console.error(err);
		}

		var extension = LS.ResourcesManager.getExtension( file.name ).toLowerCase();
		var format_info = LS.Formats.supported[ extension ];
		var format_type = "binary";
		if(format_info)
			format_type = format_info.dataType || format_info.format;

		if(format_type == "string" || format_type == "text" || format_type == "json" || format_type == "xml")
			reader.readAsText(file);
		else
			reader.readAsArrayBuffer(file);
	},

	importFile: function( file, on_complete, options )
	{
		this.loadFileToMemory( file, function(file,options){
			var res = ImporterModule.processResource( file.name, file, options, on_complete );
			if(res && on_complete)
				on_complete(res);
		},options);
	},

	getImporterOptions: function()
	{
		var import_options = {};
		for(var i in this.preferences)
			import_options[i] = this.preferences[i];
		return import_options;
	},

	sortFilesByPriority: function( files )
	{
		var result = [];
		Array.prototype.push.apply(result,files); //convert to regular array
		result = result.sort( function(a,b) { 
			if(is_image(a))
				return a;
			if(is_image(b))
				return b;
			return a;
		});

		function is_image( file )
		{
			var ext = LS.RM.getExtension(file.name);
			var format = LS.Formats.supported[ext];
			if(!format || format.type != "image")
				return false;
			return true;
		}

		return result;
	},

	//show the dialog to perform actions to the imported file
	showImportResourceDialog: function( file, options, on_complete )
	{
		options = options || {};

		var dialog = new LiteGUI.Dialog("dialog_import_resource", {title: "Import File", close: true, minimize: true, width: 480, height: 340, scroll: false, draggable: true});
		dialog.show();

		var target = LS.Material.COLOR_TEXTURE;
		var insert_into = false;

		var filename = "";
		var folder = options.folder;
		var resource = null;

		var import_options = this.getImporterOptions();

		var file_content = file ? file.data : null;
		var url = "";
		var drop_node = options.node;
		var material = drop_node ? drop_node.getMaterial() : null;

		var inspector = new LiteGUI.Inspector(null,{ name_width: "50%" });
		inspector.on_refresh = inner_refresh;
		inspector.refresh();
		dialog.add( inspector );

		//* no va...
		var drop_area = dialog.content;
		drop_area.addEventListener("dragenter", function (evt) {
			evt.stopPropagation();
			evt.preventDefault();
			return true;
		},false);

		drop_area.addEventListener("drop", function(evt){
			evt.preventDefault();
			evt.stopPropagation();
			evt.stopImmediatePropagation();
			var files = evt.dataTransfer.files;
			if(files && files.length)
			{
				inner_setFile(files[0]);
				inspector.refresh();
			}
			return true;
		}, false);
		//*/

		//file data and it has a URL associated (comes from dragging a link to this tab)
		if(file && file.url)
			inner_setFile(file.url);

		//Function that loads the data
		function inner_setFile( v )
		{
			file = v;
			file_content = null;
			if(!file || file.data)
				return;

			if(v.constructor == String) //URL
			{
				var filename = DriveModule.getFilename(v);
				file = { name: filename, size: 0, type: "?", data: null };
				var info = LS.Formats.getFileFormatInfo( file.name );
				var proxy_url = LS.RM.getFullURL( v );
				if(info && info.format == "text")
					LiteGUI.requestText( proxy_url, function(v, response) { inner_setContent(v, response.getResponseHeader("Content-Type") ); });
				else
					LiteGUI.requestBinary( proxy_url, function(v, response) { inner_setContent(v, response.getResponseHeader("Content-Type") ); });
				return;
			}

			//file without data
			var reader = new FileReader();
			reader.onload = function(e) { inner_setContent( e.target.result ); inspector.refresh(); }
			var info = LS.Formats.getFileFormatInfo( file.name );
			if(info && info.format == "text")
				reader.readAsText( file );
			else
				reader.readAsArrayBuffer( file );
			reader.onerror = function(err)
			{
				console.error(err);
			}
		}

		//function to assign the content of the file
		function inner_setContent(v, type)
		{
			file_content = v;
			if(file)
			{
				file.data = file_content;
				file.size = file_content.length || file_content.byteLength;
				if(type)
					file.type = type;
			}
			inspector.refresh();
		}

		//refresh the inspector information
		function inner_refresh()
		{
			inspector.clear();
			//inspector.addInfo(null, "Drag a File into the window or click the button");
			inspector.addTitle("Select a file" );
			inspector.addFile("Import from Harddrive", file ? file.name : "", function(v){
				//console.log(v);
				inner_setFile( file = v ? v.file : null );
				inspector.refresh();
			});
			inspector.addString("Import from URL", url, { callback: function(v){
				url = v;
				inner_setFile( v );
				inspector.refresh();
			}});

			inspector.addTitle("Destination" );
			inspector.addFolder("Save to folder", folder || "", { callback: function(v){
				folder = v;
			}});

			if(file)
			{
				inspector.addTitle("File Information" );
				inspector.addString("Filename", file.name );
				inspector.addInfo("Bytes", DriveModule.beautifySize( file.size ) );
				inspector.addInfo("Type", file.type );

				inspector.addCheckbox("Optimize data", import_options.optimize_data, { callback: function(v) { import_options.optimize_data = v; }});

				var info = LS.Formats.getFileFormatInfo( file.name );
				if(!info)
				{
					inspector.addTitle("Unknown resource");
				}
				else if(info.resource == "Mesh" )
				{
					inspector.addTitle("Mesh");
					inspector.addCombo("Action", ImporterModule.preferences.mesh_action, { values: {"Insert in Origin":"origin","Insert in intersection":"plane","Replace Mesh":"replace"}, callback: function(v) { 
						ImporterModule.preferences.mesh_action = v;
					}});
					//inspector.addCheckbox("Insert into scene", insert_into, { callback: function(v) { insert_into = v; }});
				}
				else if(info.resource == "Texture" )
				{
					inspector.addTitle("Texture");
					inspector.addCombo("Action", ImporterModule.preferences.texture_action, { values: {"Replace in material":"replace","Insert as Plane":"plane","Insert as Sprite":"sprite"}, callback: function(v) { 
						ImporterModule.preferences.texture_action = v;
					}});

					if(drop_node)
					{
						//inspector.addCheckbox("Add to node material", insert_into, { callback: function(v) { insert_into = v; }});
						if(material)
						{
							var channels = material.getTextureChannels();
							target = channels[0];
							inspector.addCombo("Channel", target, { values: channels, callback: function(v) { 
								target = v;
							}});
						}
					}
					inspector.addCheckbox("Optimize data", import_options.optimize_data, { callback: function(v) { import_options.optimize_data = v; }});
				}
				else if(info.resource == "SceneTree" )
				{
					inspector.addTitle("Scene");
					inspector.addCheckbox("Optimize data", import_options.optimize_data, { callback: function(v) { import_options.optimize_data = v; }});
					inspector.addCheckbox("Use node names to reference nodes", import_options.use_names_to_reference, { callback: function(v) { import_options.use_names_to_reference = v; }});
				}
			}
		}

		dialog.addButton("Import to Memory", { className: "big", callback: inner_import });
		var imp_and_insert = dialog.addButton("Import and Insert in Scene", { className: "big", callback: inner_import });
		dialog.addButton("Cancel", { className: "big", callback: function() { dialog.close(); } });

		function inner_import( button, callback )
		{
			if(button == imp_and_insert)
				insert_into = true;

			if(!file)
				return LiteGUI.alert("No file imported");

			filename = inspector.getValue("Filename");
			filename = filename.replace(/ /g,"_"); //no spaces in names			

			for(var i in options)
				import_options[i] = options[i];

			import_options.filename = filename;
			import_options.target = target; //if its texture
			file.filename = filename;

			ImporterModule.processResource( name, file, import_options, inner_processed );
			dialog.close();
		}

		function inner_processed( filename, resource, options)
		{
			options = options || {};

			if(resource.filename)
				filename = resource.filename;

			if(folder)
				inner_saveToFolder( resource, folder );
			else
			{
				if(on_complete)
					on_complete();
			}

			//we do this afterwards because saving it could change the name
			if(insert_into)
			{
				options.mesh_action = ImporterModule.preferences.mesh_action;
				options.texture_action = ImporterModule.preferences.texture_action;
				DriveModule.onInsertResourceInScene( resource, options );
			}

			dialog.close();
		}

		function inner_saveToFolder( resource, folder )
		{
			if(!folder)
				return;
			if(!resource.filename)
				return;
			var fullpath = folder + "/" + resource.filename;
			LS.ResourcesManager.renameResource( resource.filename, fullpath );
			resource.fullpath = fullpath;

			DriveModule.saveResource( resource, on_complete, { skip_alerts: true } );
		}
	},

	// Called from showImportResourceDialog when a file is loaded in memory
	// This function wraps the processResource from LS.ResourcesManager to add some extra behaviours
	// Mostly conversions, optimizations, and so
	processResource: function (name, file, options, on_complete)
	{ 
		options = options || {};

		if(!file.data)
			return console.error("File data missing, use FileReader");

		var filename = options.filename || file.name;
		filename = filename.toLowerCase(); //force lower case in filenames to avoid case sensitive issues

		var resource = LS.ResourcesManager.processResource( filename, file.data, options, inner );

		return null;

		function inner(filename, resource)
		{
			var extension = LS.RM.getExtension( filename );
			var format = LS.Formats.supported[ extension ];

			if(resource)
			{
				console.log( "Imported resource: " + LS.getObjectClassName(resource) );
				if(options.optimize_data)
				{
					if( resource.constructor == GL.Mesh && extension != "wbin" )
					{
						resource._original_data = resource.toBinary().buffer; //ArrayBuffer
						filename = filename + ".wbin";
						LS.ResourcesManager.renameResource( resource.filename, filename );
					}
					if( resource.constructor == GL.Texture && (!format || !format["native"]) )
					{
						resource._original_data = null;
						var blob = resource.toBlob(true);
						var reader = new FileReader();
						reader.onload = function() {
							resource._original_data = this.result;
						};
						reader.readAsArrayBuffer( blob );

						filename = filename + ".png";
						LS.ResourcesManager.renameResource( resource.filename, filename );
					}
				}
				
				if(!resource._original_file && !resource._original_data)
					resource._original_file = file;

				//scenes require to rename some stuff 
				if(resource.constructor === LS.SceneTree || resource.constructor === LS.SceneNode )
				{
					//remove node root, dragging to canvas should add to scene.root
					options.node = null;

					var resources = resource.getResources({},true);

					if(options.optimize_data)
					{
						for(var i in resources)
						{
							var res = LS.ResourcesManager.getResource(i);
							if(res && res.constructor === LS.Animation)
							{
								var anim = res;
								anim.optimizeTracks();
							}
						}
					}

					if( options.use_names_to_reference)
					{
						//rename bone references
						for(var i in resources)
						{
							var res = LS.ResourcesManager.getResource(i);
							if(res && res.constructor === GL.Mesh && res.bones)
							{
								var mesh = res;
								mesh.convertBonesToNames( resource );
							}
						}

						//rename animation tracks
						if(resource.animations)
						{
							var animation = LS.RM.getResource(resource.animations);
							if(animation)
								animation.convertIDstoNames( true, resource );
						}
					}
				}

			}

			if(on_complete)
				on_complete( filename, resource, options );
		}
	},

	insertMeshInScene: function(mesh)
	{
		var node = new LS.SceneNode();
		node.name = mesh.filename || "Mesh";
		if( mesh.info && mesh.info.groups || mesh.info.groups.length )
		{
			for(var i in mesh.info.groups)
			{
				var group = mesh.info.groups[i];

				if(group.material)
				{
					var meshrenderer = new LS.Components.MeshRenderer();
					meshrenderer.mesh = mesh.fullpath || mesh.filename;
					meshrenderer.submesh_id = i;
					meshrenderer.material = group.material;
					node.addComponent( meshrenderer );
				}
			}
		}
		else
		{
			var meshrenderer = new LS.Components.MeshRenderer();
			meshrenderer.mesh = mesh.fullpath || mesh.filename;
			node.addComponent( meshrenderer );
		}

		LS.GlobalScene.root.addChild( node );
	}
};

CORE.registerModule( ImporterModule );