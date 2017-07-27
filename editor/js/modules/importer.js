/* 
	It handles importing new models and textures from DISK or internet, parsing them and store them.
	It allows to save them locally or add them to the Resources Database.
*/

var ImporterModule  = {

	name: "importer",
	
	//this are saved between sessions
	preferences: {
		optimize_data: true,
		mesh_action: "origin",
		texture_action: "replace",
		use_names_to_reference: true,
		force_lowercase: true
	},

	init: function()
	{
		//if(window.gl && window.gl.canvas )
		//	LiteGUI.createDropArea( gl.canvas, ImporterModule.onItemDrop.bind(this) );
		LiteGUI.menubar.add("Actions/Import Files", { callback: function() { ImporterModule.showImportResourceDialog(); }});

		window.addEventListener("paste", this.onPaste.bind(this) );
	},

	onPaste: function(e)
	{
		console.log("pasted items:",e.clipboardData.items.length,"files:",e.clipboardData.files.length, "types:", e.clipboardData.types.length);
		var items = (e.clipboardData || e.originalEvent.clipboardData).items;
		var item0 = items.length ? items[0] : null;
		if( item0 && item0.kind == "file" )
		{
			this.onLoadPastedItem( item0 );
			return false; // Prevent the default handler from running.
		}
	},

	onLoadPastedItem: function(item)
	{
		var file = item.getAsFile();
		if(!file)
			return;
		if(!file.name)
		{
			if(item.type == "image/png")
				file.name = "clipboard.png";
			else if(item.type == "image/jpeg")
				file.name = "clipboard.jpg";
			else
				file.name = "unknown.bin";
			LiteGUI.prompt("Enter a filename", function(v){
				if(!v)
					return;
				file.name = v;
				ImporterModule.loadFileToMemory( file, ImporterModule.showImportResourceDialog.bind( ImporterModule ) );
			}, { value: file.name });
		}
		else
			ImporterModule.loadFileToMemory( file, ImporterModule.showImportResourceDialog.bind( ImporterModule ) );
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
		//var files = evt.dataTransfer.files;
		var files = this.getFilesFromEvent( evt, options );
		//console.log("Files found: ", files.length, "Items:",  evt.dataTransfer.items.length, " Files:",  evt.dataTransfer.files.length );
		if(files && files.length)
			this.processFileList( files, options );

		//drag something else on the canvas
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

				var r;
				if(options.node)
					r = EditorModule.onDropResourceOnNode( res_fullpath, options.node, evt );

				if(!r)
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

	getFilesFromEvent: function( e, options )
	{
		var files = [];
		var that = this;

		//first the files
		for(var i=0; i < e.dataTransfer.files.length; i++)
		{
			var file = e.dataTransfer.files[i];
			if(!file.size)
				continue; //folders are files with 0 size
			files.push( file );
		}

		//then the items (they may be folders)
		for(var i=0; i < e.dataTransfer.items.length; i++)
		{
			var item = e.dataTransfer.items[i];
			var func = item.webkitGetAsEntry || item.mozGetAsEntry || item.getAsEntry; //experimental
			if(!func)
				break;
			var entry = func.call( item );
			if(!entry || !entry.isDirectory)
				continue; //not a folder
			traverseFileTree(entry);
		}

		function traverseFileTree( item, path ) {
			path = path || "";
			if (item.isFile) {
				// Get file
				item.file(function(file) {
					//files.push( file );
					that.processFileList([file],options,true);
				});
			} else if (item.isDirectory) {
				// Get folder contents
				var dirReader = item.createReader();
				dirReader.readEntries(function(entries) {
					for (var i=0; i<entries.length; i++) {
						traverseFileTree(entries[i], path + item.name + "/");
					}
				});
			}
		}

		return files;
	},

	processFileList: function(files, options, skip_dialog )
	{
		options = options || {};
		var that = this;

		if(files.length > 1)
		{
			//sort resources so images goes first?
			var files = ImporterModule.sortFilesByPriority( files );

			//TODO: show special dialog?
			for(var i=0; i < files.length; i++)
				this.loadFileToMemory( files[i], inner_process, options);
			return;
		}

		//one single file shows the dialog
		var file = files[0];
		var callback = skip_dialog ? inner_process : this.showImportResourceDialog.bind(this);
		this.loadFileToMemory( file, callback, options );

		function inner_process( file, options ){
			var filename = file.name.toLowerCase(); //to lower case to avoid problems
			NotifyModule.show("FILE: " + filename, { id: "res-msg-" + filename.hashCode(), closable: true, time: 3000, left: 60, top: 30, parent: "#visor" } );
			CORE.log("File dropped: " + filename);
			ImporterModule.processResource( filename, file, that.getImporterOptions( filename ), function( filename, resource ){
				//meshes must be inserted
				if(resource.constructor === GL.Mesh)
					ImporterModule.insertMeshInScene( resource );
			});
		}
	},

	//just guesses the type and loads it into memory (reads the bytes, not processing) 
	loadFileToMemory: function(file, callback, options)
	{
		if(!file)
			return;

		var reader = new FileReader();
		reader.onload = function(e) {
			file.data = e.target.result;
			if(file.data == "" && file.size > 100000) //any number should work
			{
				LiteGUI.alert("File load error, it seems the file was too big to be loaded in memory by your browser.");
				return;
			}

			try
			{
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
		reader.onprogress = function(e)
		{
			//console.log(e);
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

		var dialog = new LiteGUI.Dialog({ id: "dialog_import_resource", title: "Import File", close: true, minimize: true, width: 480, height: 360, scroll: false, draggable: true});
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

		var inspector = new LiteGUI.Inspector( { name_width: "50%" });
		inspector.on_refresh = inner_refresh;
		inspector.refresh();
		dialog.add( inspector );

		//* no va...
		var drop_area = dialog.root;
		LiteGUI.createDropArea( dialog.root, function(evt){
			var files = evt.dataTransfer.files;
			if(files && files.length)
			{
				inner_setFile(files[0]);
				inspector.refresh();
			}
			return true;
		}, 
		function(e){
			//onenter

		});

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

			inspector.addInfo("You can also drag files here directly");

			if(file)
			{
				inspector.addTitle("File Information" );
				inspector.addString("Filename", file.name );
				inspector.addInfo("Bytes", DriveModule.beautifySize( file.size ) );
				inspector.addInfo("Type", file.type );

				var ext = LS.RM.getExtension( file.name );

				if( ext === "zip" )
					inspector.addInfo("ZIP FILE");

				inspector.addCheckbox("Optimize data", import_options.optimize_data, { callback: function(v) { import_options.optimize_data = v; }});

				var info = LS.Formats.getFileFormatInfo( file.name );
				if(!info)
				{
					inspector.addTitle("Unknown resource");
				}
				else if(info.resource == "Mesh" )
				{
					inspector.addTitle("Mesh");
					inspector.addCombo("Action", ImporterModule.preferences.mesh_action, { values: {"Load in memory":"load","Insert in Origin":"origin","Insert in intersection":"plane","Replace Mesh":"replace"}, callback: function(v) { 
						ImporterModule.preferences.mesh_action = v;
					}});
					//inspector.addCheckbox("Insert into scene", insert_into, { callback: function(v) { insert_into = v; }});
				}
				else if(info.resource == "Texture" )
				{
					inspector.addTitle("Texture");
					inspector.addCombo("Action", ImporterModule.preferences.texture_action, { values: {"Load in memory":"load","Replace in material":"replace","Insert as Plane":"plane","Insert as Sprite":"sprite"}, callback: function(v) { 
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
				else if(info.resource == "SceneTree" || info.resource == "SceneNode")
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
			import_options.to_memory = !insert_into;
			file.filename = filename;

			ImporterModule.processResource( name, file, import_options, inner_processed );
			dialog.close();
		}

		function inner_processed( filename, resource, options)
		{
			options = options || {};

			var import_options = {};
			for(var i in options)
				import_options[i] = options[i];

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
				import_options.mesh_action = ImporterModule.preferences.mesh_action;
				import_options.texture_action = ImporterModule.preferences.texture_action;
				DriveModule.onInsertResourceInScene( resource, import_options );
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
	processResource: function ( name, file, options, on_complete )
	{ 
		options = options || {};

		if(!file.data)
			return console.error("File data missing, use FileReader");

		var filename = options.filename || name || file.name; //why not name?
		if(this.preferences.force_lowercase)
			filename = filename.toLowerCase(); //force lower case in filenames to avoid case sensitive issues

		var resource;
		var extension = LS.RM.getExtension( filename );
		if(extension == "zip")
		{
			LiteGUI.choice("This is a ZIP file, do you want to unzip the content? (If the zip contains an scene, select no)",["yes, unzip","no, leave as zip"], function(v){
				if( v == "yes, unzip" )
					ImporterModule.importZIP( file, inner );
				else
					resource = LS.ResourcesManager.processResource( filename, file.data, options, inner );
			},{ width: 400 });
		}
		else
			resource = LS.ResourcesManager.processResource( filename, file.data, options, inner );

		return null;

		function inner( filename, resource )
		{
			var extension = LS.RM.getExtension( filename );
			var format = LS.Formats.supported[ extension ];

			if(!resource)
			{
				if(on_complete)
					on_complete( filename, resource, options );
				return;
			}

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

			if(resource.constructor === GL.Texture )
			{
				//force generate thumbnail on imported resources
				resource._preview_url = DriveModule.generatePreview( resource.fullpath || resource.filename );
			}


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

				if( options.use_names_to_reference )
				{
					console.log("Converting uids to names in animations and bones");
					//rename bone references
					for(var i in resources)
					{
						var res = LS.ResourcesManager.getResource(i);
						if(res && res.constructor === GL.Mesh && res.bones)
						{
							var mesh = res;
							mesh.convertBoneNames( resource, false );
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

			if(on_complete)
				on_complete( filename, resource, options );
		}
	},

	importZIP: function( file, on_complete )
	{
		if(!window.JSZip)
		{
			LiteGUI.alert("JSZIP.js not found.");
			return;
		}

		var reader = new FileReader();
		reader.onload = function(e)
		{
			var zip = new JSZip();
			console.log("unziping data...");
			zip.loadAsync(e.target.result).then(function(zip) {
				 // you now have every files contained in the loaded zip
				zip.forEach(function (relativePath, file){
					console.log("file in ZIP", relativePath );
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
							var blob = new Blob([content],{name: "foo", type:"application/octet-stream"});
							blob.name = this.name;
							console.log( blob );
							//console.log(content);
							LS.ResourcesManager.processResource( blob.name, content, null, on_complete );
						}).bind(file) );
					}
				});
			});
		}
		console.log("reading zip data...");
		reader.readAsArrayBuffer( file );
	},

	insertMeshInScene: function(mesh)
	{
		var node = new LS.SceneNode();
		node.name = mesh.filename || "Mesh";
		if( mesh.info && mesh.info.groups && mesh.info.groups.length )
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