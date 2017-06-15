var UnknownMeshTool = {

	name: "unknownMesh",

	init: function()
	{
		LiteGUI.menubar.add("Window/unknown Mesh", { callback: function() { UnknownMeshTool.showDialog(); }});
	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Window/unknown Mesh");
		if(this.node)
		{
			this.node.parentNode.removeChild( this.node );
			this.node = null;
		}
	},

	showDialog: function()
	{
		var dialog = new LiteGUI.Dialog("unknownMesh", {title:"Unknown Mesh", close: true, width: 300, height: 120, scroll: false, draggable: true});
		var inspector = new LiteGUI.Inspector(null,{scroll: true, resizable: true, full: true});

		var file = this.last_file;
		var options = this.last_options || {
			start: 0,
			len: 0,
			normals: false
		};

		inspector.on_refresh = function()
		{
			inspector.clear();
			inspector.addFile("Choose file","", {callback: function(v){
				file = v.file;
				UnknownMeshTool.last_file = file;
				inner_readFile(file);
				inspector.refresh();
				dialog.adjustSize();
			}});

			if(!file)
				return;

			inspector.addString("Filename",file.name);
			inspector.addString("Size",file.size);

			if(!file.data)
				return;

			inspector.addTitle("Settings");
			inspector.addNumber("start", options.start , { step: 1, min: 0, callback: function(v){ options.start = v; }});
			inspector.addNumber("length", options.len, { step: 1, min: 0, callback: function(v){ options.len = v; }});
			inspector.addNumber("offset", options.offset, { step: 1, min: 0, callback: function(v){ options.offset = v; }});
			inspector.addCheckbox("Normals", options.normals, { callback: function(v){ options.normals = v; }});

			inspector.addButton(null,"Process mesh", function(){
				if(file.data)
					UnknownMeshTool.processDataAsMesh( file.data, options );			
			});
		}

		function inner_readFile( file )
		{
			var reader = new FileReader();
			reader.onload = function(e){
				file.data = e.target.result;
				inspector.refresh();
				dialog.adjustSize();
			};
			reader.readAsArrayBuffer(file);
		}

		inspector.refresh();
		dialog.add(inspector);
		dialog.show();
		dialog.adjustSize();
	},

	processDataAsMesh: function( data, options )
	{
		this.last_options = options;

		var node = this.node;
		if(!node)
		{
			node = new LS.SceneNode();
			node.name = "unknown_mesh";
			LS.GlobalScene.root.addChild( node );
			node.addComponent( new LS.Components.MeshRenderer({ point_size: -1, primitive: gl.POINTS, mesh: "unknownMesh" }) );
			this.node = node;
		}

		var typed_data = new Uint8Array( data );

		var start = options.start;
		var end = typed_data.length;
		var len = options.len;
		if( len )
			end = start + (len - len % 4);
		if(end > typed_data.length)
			end = typed_data.length - typed_data.length % 4;

		var final_data = typed_data.subarray( start, end );
		var vertices = null;
	
		if(!options.offset)
		{
			vertices = new Float32Array( (new Uint8Array( final_data )).buffer );
		}
		else
		{
			final_data = new Uint8Array( final_data );
			vertices = new Float32Array( final_data.length / 4 );

			var float_bytes = new Uint8Array( vertices.buffer );
			var offset = 4 * 3 + options.offset;
			var last_pos = 0;
			for(var i = 0, l = float_bytes.length; i < l; i += offset )
			{
				float_bytes.set( final_data.subarray(i,i+4*3),last_pos );
				last_pos += 4*3;
				//read normals too?
			}
			vertices = vertices.subarray(0,last_pos / 12);
		}

		var mesh = GL.Mesh.load({vertices: vertices});
		LS.RM.meshes["unknownMesh"] = mesh;
		RenderModule.requestFrame();
	}
};

CORE.registerPlugin( UnknownMeshTool );
