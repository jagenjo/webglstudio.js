var MeshTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Mesh Tools", { callback: function() { 
			MeshTools.showToolsDialog();
		}});
	},

	showToolsDialog: function( mesh_name )
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog({ id: "dialog_mesh_tools", title:"Mesh Tools", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector({ id: "mesh_tools", name_width: "50%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}
		widgets.on_refresh = inner_update;

		inner_update();

		function inner_update()
		{
			var mesh = null;
			if( mesh_name )
				mesh = LS.ResourcesManager.getMesh( mesh_name );

			widgets.clear();

			widgets.addMesh("Mesh", mesh_name || "", { name_width: 100, callback: function(v) {
				mesh_name = v;
				inner_update();
			}, callback_load: function( res ){
				mesh_name = res.filename;
				inner_update();
			}});

			widgets.addButton(null,"From selected node", function(){
				var node = SelectionModule.getSelectedNode();
				if(!node)
					return;
				var compo = node.getComponent( LS.Components.MeshRenderer );
				if(!compo)
					return;
				mesh_name = compo.mesh;
				inner_update();
			});

			if(mesh)
			{
				mesh.inspect( widgets, true );
			}
			else
			{
				if(LS.ResourcesManager.isLoading( mesh ))
					widgets.addInfo(null, "Loading...");
			}

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize(10);

		}//inner update

		dialog.add( widgets );
		dialog.adjustSize(10);		
	},

	sortMeshTriangles: function( mesh, sort_mode )
	{
		//check if indexed
		var indices = mesh.getIndexBuffer("triangles");
		if(!indices)
			return false;

		//num triangles
		var data = indices.data;
		var num_triangles = indices.data.length / 3;

		//vertices
		var vertex_buffer = mesh.getBuffer("vertices");
		var vertex_data = vertex_buffer.data;

		//create an array of size num_triangles
		var distances = new Array( num_triangles ); //[index, distance]

		if( sort_mode == "inside_to_outside" || sort_mode == "outside_to_inside" ) //distance to center
		{
			var center = vec3.create();
			var temp = vec3.create();
			var sign = sort_mode == "outside_to_inside" ? -1 : 1;
			//for every triangle
			for(var i = 0; i < num_triangles; ++i)
			{
				var ind = data.subarray( i*3, i*3 + 3 );
				var A = vertex_data.subarray( ind[0] * 3, ind[0] * 3 + 3 );
				var B = vertex_data.subarray( ind[1] * 3, ind[1] * 3 + 3 );
				var C = vertex_data.subarray( ind[2] * 3, ind[2] * 3 + 3 );
				temp.set( A );
				vec3.add( temp, temp, B );
				vec3.add( temp, temp, C );
				vec3.scale( temp, temp, 1/3 );
				distances[i] = [i, sign * vec3.distance(center, temp), ind[0],ind[1],ind[2]  ];
			}
		}
		else //axis
		{
			var axis = 0;
			var sign = +1;
			switch( sort_mode )
			{
				case "+X": axis = 0; break;
				case "+Y": axis = 1; break;
				case "+Z": axis = 2; break;
				case "-X": axis = 0; sign = -1; break;
				case "-Y": axis = 1; sign = -1; break;
				case "-Z": axis = 2; sign = -1; break;
			}

			//for every triangle
			for(var i = 0; i < num_triangles; ++i)
			{
				var ind = data.subarray( i*3, i*3 + 3 );
				//compute the biggest value in an axis
				var A = vertex_data.subarray( ind[0] * 3, ind[0] * 3 + 3 );
				var B = vertex_data.subarray( ind[1] * 3, ind[1] * 3 + 3 );
				var C = vertex_data.subarray( ind[2] * 3, ind[2] * 3 + 3 );
				//distances[i] = [i, (A[axis] + B[axis] + C[axis]) * sign, ind[0],ind[1],ind[2]  ];
				//distances[i] = [i, Math.max(Math.max(A[axis],B[axis]), C[axis]) * sign, ind[0],ind[1],ind[2]  ];
				distances[i] = [i, Math.min(Math.min( A[axis], B[axis]), C[axis]) * sign, ind[0],ind[1],ind[2]  ];
			}
		}

		//sort by this array
		distances.sort(function(A,B){ return A[1] - B[1]; });

		//apply changes to buffer
		for(var i = 0; i < distances.length; ++i)
		{
			var d = distances[i];
			data[i*3] = d[2];
			data[i*3+1] = d[3];
			data[i*3+2] = d[4];
		}

		indices.upload( gl.STATIC_DRAW );

		mesh.indexBuffers = { "triangles": indices }; //destroy all the other indexBuffers, they are wrong

		return true;
	},

	rotateMeshVertices: function( mesh, axis, angle )
	{
		angle = angle || 90;

		var q = quat.create();
		var axis_vector = null;
		switch( axis )
		{
			case "+Y": quat.setAxisAngle( q, [0,1,0], angle * DEG2RAD ); break;
			case "+Z": quat.setAxisAngle( q, [0,0,1], angle * DEG2RAD ); break;
			case "-X": quat.setAxisAngle( q, [-1,0,0], angle * DEG2RAD ); break;
			case "-Y": quat.setAxisAngle( q, [0,-1,0], angle * DEG2RAD ); break;
			case "-Z": quat.setAxisAngle( q, [0,0,-1], angle * DEG2RAD ); break;
			case "+X": 
			default: quat.setAxisAngle( q, [1,0,0], angle * DEG2RAD ); break;
		}

		var rot_matrix = mat4.fromQuat( mat4.create(), q );
		var vertices = mesh.getBuffer("vertices");
		if(!vertices)
			return false;
		vertices.applyTransform( rot_matrix ).upload( gl.STATIC_DRAW );
		var normals = mesh.getBuffer("normals");
		if(normals)
			normals.applyTransform( rot_matrix ).upload( gl.STATIC_DRAW );
		mesh.updateBounding();
		return true;
	},

	centerMeshVertices: function( mesh )
	{
		var matrix = mat4.create();
		var center = BBox.getCenter( mesh.bounding );
		vec3.scale( center, center, -1 );
		mat4.translate( matrix, matrix, center );
		var vertices = mesh.getBuffer("vertices");
		if(!vertices)
			return false;
		vertices.applyTransform( matrix ).upload( gl.STATIC_DRAW );
		mesh.updateBounding();
		return true;
	},

	generateTextureCoords: function( mesh, mode, param )
	{
		if(mode == "triplanar")
		{
			mesh.computeTextureCoordinates();
			return true;
		}

		var vertices_buffer = mesh.getBuffer("vertices");
		if(!vertices_buffer)
			return false;
		var coords_buffer = mesh.getBuffer("coords");
		if(!vertices_buffer)
			return false;
		var vertices = vertices_buffer.data;
		var coords = coords_buffer.data;
		var num = vertices.length / 3;
		var bounding = mesh.getBoundingBox();
		var min = BBox.getMin(bounding);
		var size = vec3.scale( vec3.create(), BBox.getHalfsize(bounding), 2 );

		var index_u = 0;
		var index_v = 1;

		switch (mode)
		{
			case "+x": 
			case "x": index_u = 1; index_v = 2; break;
			case "+y": 
			case "y": index_u = 0; index_v = 2; break;
			case "+z": 
			case "z": index_u = 0; index_v = 1; break;
			case "-x": index_u = 2; index_v = 1; break;
			case "-y": index_u = 2; index_v = 0; break;
			case "-z": index_u = 1; index_v = 0; break;
			default: return false;
		}

		for(var i = 0; i < num; ++i)
		{
			var vertex = vertices.subarray(i*3,i*3+3);
			var coord = coords.subarray(i*2,i*2+2);
			coord[0] = (vertex[index_u] - min[index_u]) / size[index_u]; 
			coord[1] = (vertex[index_v] - min[index_v]) / size[index_v]; 
		}
		coords_buffer.upload();
		return true;
	},

	applyTransform: function( mesh )
	{
		var selected_node = SelectionModule.getSelectedNode();
		if(!selected_node || !selected_node.transform )
			return false;

		var matrix = mat4.create();
		matrix.set( SelectionModule.getSelectedNode().transform.getGlobalMatrix() );
		var normal_matrix = mat4.create();
		normal_matrix.set( matrix );
		mat4.invert( normal_matrix, normal_matrix );
		mat4.transpose( normal_matrix, normal_matrix );

		selected_node.transform.reset();

		var vertices = mesh.getBuffer("vertices");
		if(!vertices)
			return false;
		vertices.applyTransform( matrix ).upload( gl.STATIC_DRAW );

		var normals = mesh.getBuffer("normals");
		if(!normals)
			return false;
		normals.applyTransform( normal_matrix ).upload( gl.STATIC_DRAW );

		mesh.updateBounding();
		return true;
	}

};

GL.Mesh.prototype.inspect = function( widgets, skip_default_widgets )
{
	var mesh = this;

	widgets.addTitle("Vertex Buffers [num. vertex]");
	widgets.widgets_per_row = 2;
	var num_vertices = -1;
	var vertices_buffer = mesh.vertexBuffers["vertices"];
	if(vertices_buffer)
		num_vertices = vertices_buffer.data.length / 3;
	for(var i in mesh.vertexBuffers)
	{
		var buffer = mesh.vertexBuffers[i];
		var type = "";
		switch( buffer.data.constructor )
		{
			case Float32Array: type = "Float32"; break;
			case Float64Array: type = "Float64"; break;
			case Uint8Array: type = "Uint8"; break;
			case Uint16Array: type = "Uint16"; break;
			case Uint32Array: type = "Uint32"; break;
			default: type = "???"; break;
		}
		var info = widgets.addInfo(i, (buffer.data.length / buffer.spacing) + " [" + type + "]", { width: "calc( 100% - 30px )", buffer: buffer, callback: function(){
			console.log(this.options.buffer);			
		}});
		if( num_vertices != -1 && (buffer.data.length / buffer.spacing) != num_vertices )
			info.style.backgroundColor = "#6b2d2d";

		var disabled = false;
		if(i == "vertices" || i == "normals" ) //|| i == "coords")
			disabled = true;
		var button = widgets.addButton(null,"<img src='imgs/mini-icon-trash.png'/>", { width: 30, stream: i, disabled: disabled, callback: function(){
			delete mesh.vertexBuffers[ (this.options.stream) ];
			LS.RM.resourceModified(mesh);
			widgets.refresh();
		}});
	}
	widgets.widgets_per_row = 1;

	widgets.addTitle("Indices Buffers [num. indices]");
	widgets.widgets_per_row = 2;
	for(var i in mesh.indexBuffers)
	{
		var buffer = mesh.indexBuffers[i];
		var type = "";
		switch( buffer.data.constructor )
		{
			case Float32Array: type = "Float32"; break;
			case Float64Array: type = "Float64"; break;
			case Uint8Array: type = "Uint8"; break;
			case Uint16Array: type = "Uint16"; break;
			case Uint32Array: type = "Uint32"; break;
			default: type = "???"; break;
		}
		widgets.addInfo(i, buffer.data.length + " [" + type + "]", { width: "calc( 100% - 30px )" } );
		widgets.addButton(null,"<img src='imgs/mini-icon-trash.png'/>", { width: 30, stream: i, callback: function(){
			//delete mesh.indexBuffers[ (this.options.stream) ];
			mesh.explodeIndices( this.options.stream );
			LS.RM.resourceModified( mesh );
			widgets.refresh();
		}});
	}

	widgets.widgets_per_row = 1;

	if(mesh.bounding)
	{
		widgets.addTitle("Bounding");
		widgets.addVector3("Center", BBox.getCenter( mesh.bounding ), { disabled: true } );
		widgets.addVector3("Halfsize", BBox.getHalfsize( mesh.bounding ), { disabled: true } );
	}

	if(mesh.info && mesh.info.groups)
	{
		var group = widgets.beginGroup("Groups",{ collapsed: true, height: 150, scrollable: true });
		for(var i = 0; i < mesh.info.groups.length; i++)
		{
			var group = mesh.info.groups[i];
			var str = group.name;
			if(group.material)
				str += " <span class='mat' style='color:white;'>"+group.material+"<span>";
			if(group.bounding)
				str += " <span class='info' style='color:gray;'>[BB]<span>";
			var w = widgets.addInfo(i, str, { name_width: 50 } );
		}
		widgets.addButton(null,"Compute bounding boxes", { callback: function(){
			mesh.updateBoundingBox();
			widgets.refresh();
			LS.RM.resourceModified(mesh);
			RenderModule.requestFrame();
		}});
		widgets.endGroup();
	}

	widgets.addTitle("Actions");

	widgets.addButton(null, "Center Vertices", function(){
		MeshTools.centerMeshVertices( mesh );
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	} );

	widgets.addButton(null, "Apply selected transform", function(){
		MeshTools.applyTransform( mesh );
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	} );

	widgets.addButton(null, "Generate Normals", function(){
		mesh.computeNormals();
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	} );
	widgets.addButton(null, "Flip Normals", function(){
		mesh.flipNormals();
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	} );
	
	widgets.widgets_per_row = 2;
	var sort_mode = "+X";
	widgets.addCombo("Sort triangles", sort_mode, { values:["+X","-X","+Y","-Y","+Z","-Z","inside_to_outside","outside_to_inside"], callback: function(v){
		sort_mode = v;
	}});
	widgets.addButton(null, "Sort", function(){
		MeshTools.sortMeshTriangles( mesh,sort_mode );
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	});

	var rotation_axis = "+X";
	widgets.addCombo("Rotate 90deg", rotation_axis, { values:["+X","-X","+Y","-Y","+Z","-Z"], callback: function(v){
		rotation_axis = v;
	}});
	widgets.addButton(null, "Rotate", function(){
		MeshTools.rotateMeshVertices( mesh, rotation_axis );
		LS.RM.resourceModified( mesh );
		RenderModule.requestFrame();
		widgets.refresh();
	});

	var uvs_mode = "triplanar";
	widgets.addCombo("UVs", uvs_mode, { values:["triplanar","+x","-x","+y","-y","+z","-z"], callback: function(v){
		uvs_mode = v;
	}});

	widgets.addButton(null, "Generate Coords", function(){
		MeshTools.generateTextureCoords( mesh, uvs_mode );
		LS.RM.resourceModified(mesh);
		RenderModule.requestFrame();
		widgets.refresh();
	} );


	widgets.widgets_per_row = 1;
	//widgets.addButton(null, "Weld", function(){} );

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );
}

GL.Mesh.prototype.optimize = function( options )
{
	var old_filename = this.fullpath || this.filename;
	var ext = LS.RM.getExtension( old_filename );
	if( ext == "wbin" )
		return;
	this._original_data = this.toBinary().buffer; //ArrayBuffer
	this.filename += ".wbin";
	if(this.fullpath)
		this.fullpath += ".wbin";
	LS.ResourcesManager.renameResource( old_filename, this.fullpath || this.filename );
	LS.RM.resourceModified( this );
}

CORE.registerModule( MeshTools );