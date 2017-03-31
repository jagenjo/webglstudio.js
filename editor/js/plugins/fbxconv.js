LS.fbxconv_folder = window.location.origin + window.location.pathname + "../serverapps/fbxconv/";
LS.fbxconv_path = LS.fbxconv_folder + "/fbxconv.php";

LS.ResourcesManager.registerResourcePreProcessor("fbx", function( filename, data, options ) {

	var formdata = new FormData();
	formdata.append("fbx", new Blob([data]));
	formdata.append("immediate","true");

	var notify_id = "res-msg-" + filename.hashCode();
	var notification = NotifyModule.show("Uploading FBX: " + filename, { id: notify_id, closable: true, time: 0, left: 60, top: 30, parent: "#visor" } );

	LS.Network.request({
		url: LS.fbxconv_path,
		dataType: "json",
		data: formdata,
		success: function(d)
		{
			if(!d)
			{
				var log = this.getResponseHeader("X-command-output");
				if( log )
					log = log.split("|").join("\n");
				else
					log = "empty response";
				console.error("Empty result from FBXCONV:", log );
				return;
			}

			if(d.error)
			{
				console.error("Error parsing FBX:",d.error);
				return null;
			}

			var path = d.scene_name;
			console.log(d);
			if(d.scene)
			{
				LS.ResourcesManager.processResource( filename + ".g3dj", d.scene, options, function(fullpath, res){
				if(res)
					LS.GlobalScene.root.addChild( res );
				});
			}

			//load images
			if(d.images)
			{
				for(var i in d.images)
					LS.ResourcesManager.load( LS.fbxconv_folder + d.images[i], { filename: LS.RM.getFilename( d.images[i] ), is_local: true } );
			}

			notification.kill();

			//request free space in disk
			if(path)
				setTimeout( function(){
					LS.Network.requestJSON( LS.fbxconv_path + "?done=" + path );
				}, 20000 );
		},
		uploadProgress: function(e,v)
		{
			notification.setProgress( v );
		},
		progress: function(e, v)
		{
			notification.setContent( "Downloading Data: " + filename );
			notification.setProgress( v );
		}
	});

	return true;
},"binary");

//used because it is the only format that I have a command line converted from FBX
//https://github.com/libgdx/fbx-conv

var parserG3DJ = {
	extension: "g3dj",
	convert_to: "json",
	type: "scene",
	resource: "SceneNode",
	format: "text",
	dataType:'text',

	force_lowercase: false,

	parse: function( data, options, filename )
	{
		if(!data)
		{
			console.error("G3DJ found empty string");
			return null;
		}

		var clean_filename = LS.RM.getFilename( filename );

		var scene_g3 = null;
		if(typeof(data) == "object")
			scene_g3 = data;
		else if(typeof(data) == "string")
		{
			try
			{
				scene_g3 = JSON.parse(data);
			}
			catch (err)
			{
				console.error("G3DJ data is not a valid JSON",data);
				return null;
			}
		}

		this._last_mesh_id = 0;

		console.log( scene_g3 ); 

		var scene = {
			object_class: "SceneNode",
			root: {},
			meshes: {},
			renames: {},
			materials: {}
		};
		scene.root.name = clean_filename;

		//meshes
		for(var i in scene_g3.meshes)
		{
			var mesh_info = scene_g3.meshes[i];
			var mesh = this.processMesh( mesh_info, scene );
			if(mesh)
				scene.meshes[ mesh.name ] = mesh;
		}

		//materials
		for(var i in scene_g3.materials)
		{
			var material_info = scene_g3.materials[i];
			var material = this.processMaterial( material_info, scene );
			if(material)
				scene.materials[ material.name ] = material;
		}


		//nodes (at the end so all the renames have been made)
		for(var i in scene_g3.nodes)
			this.processNode( scene_g3.nodes[i], scene.root, scene );

		console.log(scene);

		return scene;
	},

	processMesh: function( mesh_info, scene )
	{
		var streams_info = [];

		var stream_offset = 0;

		var num_bones = 0;

		for(var i in mesh_info.attributes)
		{
			switch( mesh_info.attributes[i] )
			{
				case "POSITION": 
					streams_info.push( { name: "vertices", offset: stream_offset, size: 3 } ); 
					stream_offset += 3;
					break;
				case "NORMAL":
					streams_info.push( { name: "normals", offset: stream_offset, size: 3 } ); 
					stream_offset += 3;
					break;
				case "TEXCOORD0":
					streams_info.push( { name: "coords", offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					break;
				case "TEXCOORD1":
					streams_info.push( { name: "coords1", offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					break;
				case "BLENDWEIGHT0":
					streams_info.push( { bone: 0, offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					num_bones = 1;
					break;
				case "BLENDWEIGHT1":
					streams_info.push( { bone: 1, offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					num_bones = 2;
					break;
				case "BLENDWEIGHT2":
					streams_info.push( { bone: 2, offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					num_bones = 3;
					break;
				case "BLENDWEIGHT3":
					streams_info.push( { bone: 3, offset: stream_offset, size: 2 } ); 
					stream_offset += 2;
					num_bones = 4;
					break;
				default:
					console.warn("Unsupported stream:", mesh_info.attributes[i] );
					stream_offset += 3; //assume 3
					break;
			}
		}

		var floats_per_vertex = stream_offset;
		var vertex_data = new Float32Array( mesh_info.vertices );
		var num_vertex = vertex_data.length / stream_offset;
		if( (num_vertex|0) != num_vertex)
		{
			console.error("Cannot parse mesh, unknown stream types with unknown size.");
			return null;
		}

		var mesh = {
			object_class: "Mesh",
			name: "MESH_" + (this._last_mesh_id++),
			info: { groups: [] }
		};


		var bone_weights = null;
		var bone_indices = null;
		if(num_bones)
		{
			bone_weights = new Float32Array( num_vertex * 4 );
			bone_indices = new Uint16Array( num_vertex * 4 );
			mesh.weights = bone_weights;
			mesh.bone_indices = bone_indices;
		}

		//read data streams
		for(var i in streams_info)
		{
			var info = streams_info[i];
			var data = null;
			
			//bone data
			if(info.bone !== undefined)
			{
				var pos = 0;
				var offset = floats_per_vertex;
				for (var j = info.offset; j < vertex_data.length; j += offset )
				{
					bone_indices[ pos + info.bone ] = vertex_data[j];
					bone_weights[ pos + info.bone ] = vertex_data[j+1];
					pos += 4;
				}
			}
			else //regular data (vertices, normals, coords)
			{
				data = new Float32Array( num_vertex * info.size );
				mesh[ info.name ] = data;
				var pos = 0;
				var offset = floats_per_vertex;
				for (var j = info.offset; j < vertex_data.length; j += offset )
				{
					data.set( vertex_data.subarray(j,j+info.size), pos );
					pos += info.size;
				}
			}
		}

		var groups = mesh.info.groups;
		var indices = [];
		for(var i in mesh_info.parts )
		{
			var part = mesh_info.parts[i];
			var start = indices.length;
			indices = indices.concat( part.indices );
			var group = {
				name: part.id,
				start: start,
				length: part.indices.length,
				type: part.type
			};
			scene.renames[ group.name ] = { mesh: mesh.name, group: groups.length };
			groups.push( group );
		}

		mesh.triangles = new Uint32Array( indices );
		return mesh;
	},

	processNode: function( node_info, root, scene )
	{
		var node = {};
		node.name = node_info.id;

		if(node_info.translation || node_info.rotation || node_info.scale )
		{
			node.transform = {};
			if(node_info.translation)
				node.transform.position = node_info.translation;
			if(node_info.rotation)
				node.transform.rotation = node_info.rotation;
			if(node_info.scale)
				node.transform.scale = node_info.scale;
		}

		if( !root.children )
			root.children = [];
		root.children.push( node );

		if(node_info.parts)
		{
			node.meshes = [];
			for(var i in node_info.parts)
			{
				var part = node_info.parts[i];
				var mesh_info = scene.renames[ part.meshpartid ];
				
				if(mesh_info)
				{
					var mesh = scene.meshes[ mesh_info.mesh ];
					if(mesh && part.bones)
					{
						var bone_indices = mesh.bone_indices;

						if(!mesh.bones)
						{
							mesh.bones = [];
							mesh._bones_map = {};
						}

						for(var j = 0; j < part.bones.length; ++j)
						{
							var bone = part.bones[j];
							var index = mesh._bones_map[ bone.node ];
							if( index === undefined )
							{
								var inv_bone = mat4.create();
								mat4.fromRotationTranslation( inv_bone, bone.rotation, bone.translation );
								mat4.scale( inv_bone, inv_bone, bone.scale);
								mat4.invert( inv_bone, inv_bone );
								index = mesh.bones.length;
								mesh.bones.push([ bone.node, inv_bone ]);
								mesh._bones_map[ bone.node ] = index;
							}

							//remap
							var group = mesh.info.groups[ mesh_info.group ];
							if( group && bone_indices && j != index )
							{
								var end = Math.min( bone_indices.length, (group.start + group.length) * 4 );
								for(var k = group.start * 4; k < end; ++k)
									if (bone_indices[k] == j)
										bone_indices[k] = index;
							}
						}
					}

					node.meshes.push({
						mesh: mesh_info.mesh,
						submesh_id: mesh_info.group,
						material: part.materialid + ".json"
					});
				}
				else
					console.warn("missing mesh part", part.meshpartid );
			}
		
		}

		if(node_info.children)
		{
			for(var i in node_info.children)
				this.processNode( node_info.children[i], node, scene );
		}

		return node;
	},

	processMaterial: function( material )
	{
		material.name = material.id + ".json";
		material.object_class = "StandardMaterial";

		if(material.transparency)
		{
			material.opacity = 1.0 - parseFloat( material.transparency );
			if(material.transparent)
				material.opacity = material.transparency; //why? dont know but works
		}

		//in LiteScene ambient must be 1,1,1
		material.ambient = [1,1,1]; 

		if(material.shininess)
			material.specular_gloss = material.shininess;

		//collada supports materials with colors as specular_factor but StandardMaterial only support one value
		if(material.specular && material.specular.length)
			material.specular = material.specular[0];

		if(material.textures)
		{
			var textures = {};
			for(var i in material.textures)
			{
				var tex_info = material.textures[i];
				var coords = LS.Material.COORDS_UV0;
				if( tex_info.uvs == "TEX1")
					coords = LS.Material.COORDS_UV1;
				var type = "color";
				if( tex_info.type )
					type = tex_info.type.toLowerCase();
				if(type == "diffuse")
					type = "color";
				
				tex_info = { 
					texture: tex_info.filename,
					uvs: coords
				};

				if( this.force_lowercase )
					tex_info.texture = tex_info.texture.toLowerCase();

				textures[ type ] = tex_info;
			}
			material.textures = textures;
		}

		if(material.opacity == 0 && material.textures && material.textures["color"] )
			material.opacity = 1.0;

		return material;
	}

	/*
	//depending on the 3D software used, animation tracks could be tricky to handle
	processAnimation: function( animation, renamed )
	{
		for(var i in animation.takes)
		{
			var take = animation.takes[i];

			//apply renaming
			for(var j = 0; j < take.tracks.length; ++j)
			{
				var track = take.tracks[j];
				var pos = track.property.indexOf("/");
				if(!pos)
					continue;
				var nodename = track.property.substr(0,pos);
				var extra = track.property.substr(pos);
				if(extra == "/transform") //blender exports matrices as transform
					extra = "/matrix";

				if( !renamed[nodename] )
					continue;

				nodename = renamed[ nodename ];
				track.property = nodename + extra;
			}

			//rotations could come in different ways, some of them are accumulative, which doesnt work in litescene, so we have to accumulate them previously
			var rotated_nodes = {};
			for(var j = 0; j < take.tracks.length; ++j)
			{
				var track = take.tracks[j];
				track.packed_data = true; //hack: this is how it works my loader
				if(track.name == "rotateX.ANGLE" || track.name == "rotateY.ANGLE" || track.name == "rotateZ.ANGLE")
				{
					var nodename = track.property.split("/")[0];
					if(!rotated_nodes[nodename])
						rotated_nodes[nodename] = { tracks: [] };
					rotated_nodes[nodename].tracks.push( track );
				}
			}

			for(var j in rotated_nodes)
			{
				var info = rotated_nodes[j];
				var newtrack = { data: [], type: "quat", value_size: 4, property: j + "/Transform/rotation", name: "rotation" };
				var times = [];

				//collect timestamps
				for(var k = 0; k < info.tracks.length; ++k)
				{
					var track = info.tracks[k];
					var data = track.data;
					for(var w = 0; w < data.length; w+=2)
						times.push( data[w] );
				}

				//create list of timestamps and remove repeated ones
				times.sort();
				var last_time = -1;
				var final_times = [];
				for(var k = 0; k < times.length; ++k)
				{
					if(times[k] == last_time)
						continue;
					final_times.push( times[k] );
					last_time = times[k];
				}
				times = final_times;

				//create samples
				newtrack.data.length = times.length;
				for(var k = 0; k < newtrack.data.length; ++k)
				{
					var time = times[k];
					var value = quat.create();
					//create keyframe
					newtrack.data[k] = [time, value];

					for(var w = 0; w < info.tracks.length; ++w)
					{
						var track = info.tracks[w];
						var sample = getTrackSample( track, time );
						if(!sample) //nothing to do if no sample or 0
							continue;
						sample *= 0.0174532925; //degrees to radians
						switch( track.name )
						{
							case "rotateX.ANGLE": quat.rotateX( value, value, -sample ); break;
							case "rotateY.ANGLE": quat.rotateY( value, value, sample ); break;
							case "rotateZ.ANGLE": quat.rotateZ( value, value, sample ); break;
						}
					}
				}

				//add track
				take.tracks.push( newtrack );

				//remove old rotation tracks
				for(var w = 0; w < info.tracks.length; ++w)
				{
					var track = info.tracks[w];
					var pos = take.tracks.indexOf( track );
					if(pos == -1)
						continue;
					take.tracks.splice(pos,1);
				}
			}

		}//takes

		function getTrackSample( track, time )
		{
			var data = track.data;
			var l = data.length;
			for(var t = 0; t < l; t+=2)
			{
				if(data[t] == time)
					return data[t+1];
				if(data[t] > time)
					return null;
			}
			return null;
		}
	},
	*/

};

LS.Formats.addSupportedFormat( "g3dj", parserG3DJ );
