//collada.js 
//This worker should offload the main thread from parsing big text files (DAE)
//no litegl.js code should be here
window = this;

(function(global){

var isWorker = window.document === undefined;
var DEG2RAD = Math.PI * 2 / 360;

//global temporal variables
var temp_mat4 = null;
var temp_vec2 = null;
var temp_vec3 = null;
var temp_vec4 = null;
var temp_quat = null;

if( isWorker )
{
	global.console = {
		log: function(msg) { 
			var args = Array.prototype.slice.call(arguments, 0);
			self.postMessage({action:"log", params: args});
		},
		error: function(msg) { 
			var args = Array.prototype.slice.call(arguments, 0);
			self.postMessage({action:"error", params: args});
		}
	};

	global.alert = console.error;
}

//Collada parser
global.Collada = {

	libsPath: "./",
	workerPath: "./",
	no_flip: true,
	use_transferables: true, //for workers

	init: function (config)
	{
		config = config || {}
		for(var i in config)
			this[i] = config[i];
		this.config = config;

		if( isWorker )
		{
			importScripts( this.libsPath + "gl-matrix-min.js", this.libsPath + "tinyxmlsax.js", this.libsPath + "tinyxmldom.js", this.libsPath + "tinyxmlw3cdom.js" );
		}

		//init glMatrix
		temp_mat4 = mat4.create();
		temp_vec2 = vec3.create();
		temp_vec3 = vec3.create();
		temp_vec4 = vec3.create();
		temp_quat = quat.create();

		mat4.fromDAE = function(str)
		{
			var m = new Float32Array( JSON.parse("["+str.split(" ").join(",")+"]") );
			mat4.transpose(m,m);
			return m;
		}

		if( isWorker )
			console.log("Collada worker ready");
	},

	load: function(url, callback)
	{
		request(url, function(data)
		{
			if(!data)
				callback( null );
			else
				callback( Collada.parse( data ) );
		});
	},

	_xmlroot: null,
	_nodes_by_id: null,
	_transferables: null,

	safeString: function (str) { 
		if(!str)
			return "";
		return str.replace(/ /g,"_"); 
	},

	parse: function(data, options, filename)
	{
		options = options || {};

		//console.log("Parsing collada");
		var flip = true;

		var xmlparser = null;
		var root = null;
		this._transferables = [];

		if(global["DOMParser"] && !this.config.forceParser )
		{
			xmlparser = new DOMParser();
			root = xmlparser.parseFromString(data,"text/xml");
		}
		else
		{
			//use tinyxmlparser
			xmlparser = new DOMImplementation();
			root = xmlparser.loadXML(data);

			if(!this.extra_functions)
			{
				this.extra_functions = true;
				//these methods are missing so here is a lousy implementation
				DOMDocument.prototype.querySelector = DOMElement.prototype.querySelector = function(selector)
				{
					var tags = selector.split(" ");
					var current_element = this;

					while(tags.length)
					{
						var current = tags.shift();
						var tokens = current.split("#");
						var tagname = tokens[0];
						var id = tokens[1];
						var elements = tagname ? current_element.getElementsByTagName(tagname) : current_element.childNodes;
						if(!id) //no id filter
						{
							if(tags.length == 0)
								return elements.item(0);
							current_element = elements.item(0);
							continue;
						}

						//has id? check for all to see if one matches the id
						for(var i = 0; i < elements.length; i++)
							if( elements.item(i).getAttribute("id") == id)
							{
								if(tags.length == 0)
									return elements.item(i);
								current_element = elements.item(i);
								break;
							}
					}
					return null;
				}

				DOMDocument.prototype.querySelectorAll = DOMElement.prototype.querySelectorAll = function( selector )
				{
					var tags = selector.split(" ");
					if(tags.length == 1)
						return this.getElementsByTagName( selector );

					var current_element = this;
					var result = [];

					inner(this, tags);

					function inner(root, tags )
					{
						if(!tags)
							return;

						var current = tags.shift();
						var elements = root.getElementsByTagName( current );
						if(tags.length == 0)
						{
							for(var i = 0; i < elements.length; i++)
								result.push( elements.item(i) );
							return;
						}

						for(var i = 0; i < elements.length; i++)
							inner( elements.item(i), tags.concat() );
					}

					var list = new DOMNodeList(this.documentElement);
					list._nodes = result;
					list.length = result.length;

					return list;
				}

				Object.defineProperty( DOMElement.prototype, "textContent", { 
					get: function() { 
						var nodes = this.getChildNodes();
						return nodes.item(0).toString(); 
					},
					set: function() {} 
				});
			}
		}
		this._xmlroot = root;
		//var xmlvisual_scene = root.querySelector("visual_scene");
		var xmlvisual_scene = root.getElementsByTagName("visual_scene").item(0);
		if(!xmlvisual_scene)
			throw("visual_scene XML node not found in DAE");

		//hack to avoid problems with bones with spaces in names
		this._nodes_by_id = {}; //clear
		this.readAllNodeNames(xmlvisual_scene);

		var scene = { 
			object_type:"SceneTree", 
			light: null,
			resources: {},
			root:{ children:[] }
		};

		//parse nodes tree
		var xmlnodes = xmlvisual_scene.childNodes;
		for(var i = 0; i < xmlnodes.length; i++)
		{
			if(xmlnodes.item(i).localName != "node")
				continue;

			var node = this.readNode( xmlnodes.item(i), scene, 0, flip );
			if(node)
				scene.root.children.push(node);
		}

		//read animations
		var animations = this.readAnimations(root, scene);
		if(animations)
		{
			var animations_name = "#animations_" + filename.substr(0,filename.indexOf("."));
			scene.resources[ animations_name ] = animations;
			scene.root.animations = animations_name;
		}

		//console.log(scene);
		return scene;
	},

	/* Collect node ids, in case there is bones (with spaces in name) I need to know the nodenames in advance */
	readAllNodeNames: function(xmlnode)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		if(node_id)
			this._nodes_by_id[node_id] = true; //node found
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes.item(i);

			//children
			if(xmlchild.localName != "node")
				continue;
			this.readAllNodeNames(xmlchild);
		}
	},

	readNode: function(xmlnode, scene, level, flip)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		if(!node_id)
			return null;
		var node_type = xmlnode.getAttribute("type");
		var node = { id: node_id, children:[], _depth: level };
		this._nodes_by_id[node_id] = node;

		//transform
		node.model = this.readTransform(xmlnode, level, flip );

		//node elements
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes.item(i);

			//children
			if(xmlchild.localName == "node")
			{
				var child_node = this.readNode(xmlchild, scene, level+1, flip);
				if(child_node)
					node.children.push( child_node );
				continue;
			}

			//geometry
			if(xmlchild.localName == "instance_geometry")
			{
				var url = xmlchild.getAttribute("url");
				if(!scene.resources[ url ])
				{
					var mesh_data = this.readGeometry(url, flip);
					if(mesh_data)
					{
						mesh_data.name = url;
						scene.resources[url] = mesh_data;
					}
				}

				node.mesh = url.toString();

				//binded material
				var xmlmaterial = xmlchild.querySelector("instance_material");
				if(xmlmaterial)
				{
					var matname = xmlmaterial.getAttribute("target").toString().substr(1);
					//matname = matname.replace(/ /g,"_"); //names cannot have spaces
					if(scene.resources[matname])
						node.material = matname;
					else
					{
						var material = this.readMaterial(matname);
						if(material)
						{
							material.id = matname; 
							scene.resources[ material.id ] = material;
						}
						node.material = matname;
					}
				}
			}


			//skinned or morph targets
			if(xmlchild.localName == "instance_controller")
			{
				var url = xmlchild.getAttribute("url");
				var mesh_data = this.readController(url, flip, scene );
				if(mesh_data)
				{
					var mesh = mesh_data;
					if( mesh_data.type == "morph" )
					{
						mesh = mesh_data.mesh;
						node.morph_targets = mesh_data.morph_targets;
					}

					mesh.name = url.toString();
					node.mesh = url.toString();
					scene.resources[url] = mesh;
				}
			}

			//light
			if(xmlchild.localName == "instance_light")
			{
				var url = xmlchild.getAttribute("url");
				this.readLight(node, url);
			}

			//camera
			if(xmlchild.localName == "instance_camera")
			{
				var url = xmlchild.getAttribute("url");
				this.readCamera(node, url);
			}

			//other possible tags?
		}

		return node;
	},

	//I want to change some names
	material_translate_table: {
		/*
		transparency: "opacity",
		reflectivity: "reflection_factor",
		specular: "specular_factor",
		shininess: "specular_gloss",
		emission: "emissive",
		*/
		diffuse: "color"
	},

	light_translate_table: {
		point: "omni",
		
	},

	camera_translate_table: {
		xfov: "fov",
		aspect_ratio: "aspect",
		znear: "near",
		zfar: "far"
	},

	//used when id have spaces (regular selector do not support spaces)
	querySelectorAndId: function(root, selector, id)
	{
		var nodes = root.querySelectorAll(selector);
		for(var i = 0; i < nodes.length; i++)
		{
			var attr_id = nodes.item(i).getAttribute("id");
			if( !attr_id ) 
				continue;
			attr_id = attr_id.toString();
			if(attr_id == id )
				return nodes.item(i);
		}
		return null;
	},

	readMaterial: function(url)
	{
		var xmlmaterial = this.querySelectorAndId( this._xmlroot, "library_materials material", url );
		if(!xmlmaterial)
			return null;

		//get effect name
		var xmleffect = xmlmaterial.querySelector("instance_effect");
		if(!xmleffect) return null;

		var effect_url = xmleffect.getAttribute("url").substr(1);

		//get effect
		var xmleffects = this.querySelectorAndId( this._xmlroot, "library_effects effect", effect_url );
		if(!xmleffects) return null;

		//get common
		var xmltechnique = xmleffects.querySelector("technique");
		if(!xmltechnique) 
			return null;

		var material = {};

		var xmlphong = xmltechnique.querySelector("phong");
		if(!xmlphong) 
			xmlphong = xmltechnique.querySelector("blinn");
		if(!xmlphong) 
			return null;

		//for every tag of properties
		for(var i = 0; i < xmlphong.childNodes.length; ++i)
		{
			var xmlparam = xmlphong.childNodes.item(i);

			//translate name
			var param_name = xmlparam.localName.toString();
			if(this.material_translate_table[param_name])
				param_name = this.material_translate_table[param_name];

			//value
			var xmlparam_value = xmlparam.childNodes.item(0);
			if(!xmlparam_value)
				continue;

			if(xmlparam_value.localName.toString() == "color")
			{
				material[ param_name ] = this.readContentAsFloats( xmlparam_value ).subarray(0,3);
				continue;
			}
			else if(xmlparam_value.localName.toString() == "float")
			{
				material[ param_name ] = this.readContentAsFloats( xmlparam_value )[0];
				continue;
			}

		}


		//colors
		/*
		var xmlcolors = xmlphong.querySelectorAll("color");
		for(var i = 0; i < xmlcolors.length; ++i)
		{
			var xmlcolor = xmlcolors.item(i);
			var param = xmlcolor.getAttribute("sid");
			if(this.material_translate_table[param])
				param = this.material_translate_table[param];
			material[param] = this.readContentAsFloats( xmlcolor ).subarray(0,3);
			if(param == "specular_factor")
				material[param] = (material[param][0] + material[param][1] + material[param][2]) / 3; //specular factor
		}

		//factors
		var xmlfloats = xmlphong.querySelectorAll("float");
		for(var i = 0; i < xmlfloats.length; ++i)
		{
			var xmlfloat = xmlfloats.item(i);
			var param = xmlfloat.getAttribute("sid");
			if(this.material_translate_table[param])
				param = this.material_translate_table[param];
			material[param] = this.readContentAsFloats( xmlfloat )[0];
			if(param == "opacity")
				material[param] = 1 - material[param]; //reverse 
		}
		*/

		material.object_type = "Material";
		return material;
	},

	readLight: function(node, url)
	{
		var light = {};

		var xmlnode = this._xmlroot.querySelector("library_lights " + url);
		if(!xmlnode) return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml)
			for(var i = 0; i < xml.childNodes.length; i++ )
				if( xml.childNodes.item(i).nodeType == 1 ) //tag
					children.push( xml.childNodes.item(i) );

		var xmls = xmlnode.querySelectorAll("technique");
		for(var i = 0; i < xmls.length; i++)
		{
			var xml2 = xmls.item(i);
			for(var j = 0; j < xml2.childNodes.length; j++ )
				if( xml2.childNodes.item(j).nodeType == 1 ) //tag
					children.push( xml2.childNodes.item(j) );
		}

		//get
		for(var i = 0; i < children.length; i++)
		{
			var xml = children[i];
			switch( xml.localName )
			{
				case "point": 
				case "spot": 
					light.type = this.light_translate_table[ xml.localName ]; 
					parse_params(light, xml);
					break;
				case "intensity": light.intensity = this.readContentAsFloats( xml )[0]; 
					break;
			}
		}

		function parse_params(light, xml)
		{
			for(var i = 0; i < xml.childNodes.length; i++)
			{
				var child = xml.childNodes.item(i);
				if( !child || child.nodeType != 1 ) //tag
					continue;

				switch( child.localName )
				{
					case "color": light.color = Collada.readContentAsFloats( child ); break;
					case "falloff_angle": 
						light.angle_end = Collada.readContentAsFloats( child )[0]; 
						light.angle = light.angle_end - 10; 
					break;
				}
			}
		}

		/*
		if(node.model)
		{
			var M = mat4.create();
			var R = mat4.rotate(M,M, Math.PI * 0.5, [1,0,0]);
			//mat4.multiply( node.model, node.model, R );
		}
		*/
		light.position = [0,0,0];
		light.target = [0,-1,0];

		node.light = light;
	},

	readCamera: function(node, url)
	{
		var camera = {};

		var xmlnode = this._xmlroot.querySelector("library_cameras " + url);
		if(!xmlnode) return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml) //grab all internal stuff
			for(var i = 0; i < xml.childNodes.length; i++ )
				if( xml.childNodes.item(i).nodeType == 1 ) //tag
					children.push( xml.childNodes.item(i) );

		//
		for(var i = 0; i < children.length; i++)
		{
			var tag = children[i];
			parse_params(camera, tag);
		}

		function parse_params(camera, xml)
		{
			for(var i = 0; i < xml.childNodes.length; i++)
			{
				var child = xml.childNodes.item(i);
				if( !child || child.nodeType != 1 ) //tag
					continue;
				var translated = Collada.camera_translate_table[ child.localName ] || child.localName;
				camera[ translated ] = parseFloat( child.textContent );
			}
		}

		node.camera = camera;
	},

	readTransform: function(xmlnode, level, flip)
	{
		//identity
		var matrix = mat4.create(); 
		var rotation = quat.create();
		var tmpmatrix = mat4.create();
		var tmpq = quat.create();
		var translate = vec3.create();
		var scale = vec3.fromValues(1,1,1);
		
		var flip_fix = false;

		//search for the matrix
		for(var i = 0; i < xmlnode.childNodes.length; i++)
		{
			var xml = xmlnode.childNodes.item(i);

			if(xml.localName == "matrix")
			{
				var matrix = this.readContentAsFloats(xml);
				//console.log("Nodename: " + xmlnode.getAttribute("id"));
				//console.log(matrix);
				this.transformMatrix(matrix, level == 0);
				//console.log(matrix);
				return matrix;
			}

			if(xml.localName == "translate")
			{
				var values = this.readContentAsFloats(xml);
				translate.set(values);
				continue;
			}

			//rotate
			if(xml.localName == "rotate")
			{
				var values = this.readContentAsFloats(xml);
				if(values.length == 4) //x,y,z, angle
				{
					var id = xml.getAttribute("sid");
					if(id == "jointOrientX")
					{
						values[3] += 90;
						flip_fix = true;
					}

					if(flip)
					{
						var tmp = values[1];
						values[1] = values[2];
						values[2] = -tmp; //swap coords
					}

					quat.setAxisAngle(tmpq, values.subarray(0,3), values[3] * DEG2RAD);
					quat.multiply(rotation,rotation,tmpq);
				}
				continue;
			}

			//scale
			if(xml.localName == "scale")
			{
				var values = this.readContentAsFloats(xml);
				if(flip)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}
				scale.set(values);
			}
		}

		if(flip && level > 0)
		{
			var tmp = translate[1];
			translate[1] = translate[2];
			translate[2] = -tmp; //swap coords
		}
		mat4.translate(matrix, matrix, translate);

		mat4.fromQuat( tmpmatrix , rotation );
		//mat4.rotateX(tmpmatrix, tmpmatrix, Math.PI * 0.5);
		mat4.multiply( matrix, matrix, tmpmatrix );
		mat4.scale( matrix, matrix, scale );


		return matrix;
	},

	readGeometry: function(id, flip)
	{
		var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		if(!xmlgeometry) return null;

		var use_indices = false;
		var xmlmesh = xmlgeometry.querySelector("mesh");
			
		//get data sources
		var sources = {};
		var xmlsources = xmlmesh.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources.item(i);
			if(!xmlsource.querySelector) continue;
			var float_array = xmlsource.querySelector("float_array");
			if(!float_array)
				continue;
			var floats = this.readContentAsFloats( float_array );

			var xmlaccessor = xmlsource.querySelector("accessor");
			var stride = parseInt( xmlaccessor.getAttribute("stride") );

			sources[ xmlsource.getAttribute("id") ] = {stride: stride, data: floats};
		}

		//get streams
		var xmlvertices = xmlmesh.querySelector("vertices input");
		vertices_source = sources[ xmlvertices.getAttribute("source").substr(1) ];
		sources[ xmlmesh.querySelector("vertices").getAttribute("id") ] = vertices_source;

		var groups = [];

		var triangles = false;
		var polylist = false;
		var vcount = null;
		var xmlpolygons = xmlmesh.querySelector("polygons");
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("polylist");
			if(xmlpolygons)
			{
				console.error("Polylist not supported, please be sure to enable TRIANGULATE option in your exporter.");
				return null;
			}
			//polylist = true;
			//var xmlvcount = xmlpolygons.querySelector("vcount");
			//var vcount = this.readContentAsUInt32( xmlvcount );
		}
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("triangles");
			triangles = true;
		}
		if(!xmlpolygons)
		{
			console.log("no polygons or triangles in mesh: " + id);
			return null;
		}


		var xmltriangles = xmlmesh.querySelectorAll("triangles");
		if(!xmltriangles.length)
		{
			console.error("no triangles in mesh: " + id);
			return null;
		}
		else
			triangles = true;

		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = [];
		var indicesArray = [];

		//for every triangles set
		for(var tris = 0; tris < xmltriangles.length; tris++)
		{
			var xml_shape_root = xmltriangles.item(tris);

			//for each buffer (input)
			var xmlinputs = xml_shape_root.querySelectorAll("input");
			if(tris == 0) //first iteration, create buffers
				for(var i = 0; i < xmlinputs.length; i++)
				{
					var xmlinput = xmlinputs.item(i);
					if(!xmlinput.getAttribute) continue;
					var semantic = xmlinput.getAttribute("semantic").toUpperCase();
					var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
					var offset = parseInt( xmlinput.getAttribute("offset") );
					var data_set = 0;
					if(xmlinput.getAttribute("set"))
						data_set = parseInt( xmlinput.getAttribute("set") );

					buffers.push([semantic, [], stream_source.stride, stream_source.data, offset, data_set]);
				}
			//assuming buffers are ordered by offset

			var xmlps = xml_shape_root.querySelectorAll("p");
			var num_data_vertex = buffers.length; //one value per input buffer

			//for every polygon
			for(var i = 0; i < xmlps.length; i++)
			{
				var xmlp = xmlps.item(i);
				if(!xmlp || !xmlp.textContent) break;

				var data = xmlp.textContent.trim().split(" ");

				//used for triangulate polys
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				if(use_indices && last_index >= 256*256)
					break;

				//for every pack of indices in the polygon (vertex, normal, uv, ... )
				for(var k = 0, l = data.length; k < l; k += num_data_vertex)
				{
					var vertex_id = data.slice(k,k+num_data_vertex).join(" "); //generate unique id

					prev_index = current_index;
					if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
						current_index = facemap[vertex_id];
					else
					{
						for(var j = 0; j < buffers.length; ++j)
						{
							var buffer = buffers[j];
							var index = parseInt(data[k + j]);
							var array = buffer[1]; //array with all the data
							var source = buffer[3]; //where to read the data from
							if(j == 0)
								vertex_remap[ array.length / num_data_vertex ] = index;
							index *= buffer[2]; //stride
							for(var x = 0; x < buffer[2]; ++x)
								array.push( source[index+x] );
						}
						
						current_index = last_index;
						last_index += 1;
						facemap[vertex_id] = current_index;
					}

					if(!triangles) //split polygons then
					{
						if(k == 0)	first_index = current_index;
						if(k > 2 * num_data_vertex) //triangulate polygons
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
					}

					indicesArray.push( current_index );
				}//per vertex
			}//per polygon

			//groups.push(indicesArray.length);
		}//per triangles group


		var mesh = {
			vertices: new Float32Array(buffers[0][1]),
			_remap: new Uint16Array(vertex_remap)
		};

		var translator = {
			"normal":"normals",
			"texcoord":"coords"
		};

		for(var i = 1; i < buffers.length; ++i)
		{
			var name = buffers[i][0].toLowerCase();
			var data = buffers[i][1];
			if(!data.length) continue;

			if(translator[name])
				name = translator[name];
			if(mesh[name])
				name = name + buffers[i][5];
			mesh[ name ] = new Float32Array(data); //are they always float32? I think so
		}
		
		if(indicesArray.length)
			mesh.triangles = new Uint16Array(indicesArray);

		//console.log(mesh);


		//swap coords (X,Y,Z) -> (X,Z,-Y)
		if(flip && !this.no_flip)
		{
			var tmp = 0;
			var array = mesh.vertices;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}

			array = mesh.normals;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}
		}

		//transferables for worker
		if(isWorker && this.use_transferables)
		{
			for(var i in mesh)
			{
				var data = mesh[i];
				if(data && data.buffer && data.length > 100)
				{
					this._transferables.push(data.buffer);
				}
			}
		}


		//extra info
		mesh.filename = id;
		mesh.object_type = "Mesh";
		return mesh;
		
	},

	//like querySelector but allows spaces in names...
	findXMLNodeById: function(root, nodename, id)
	{
		var childs = root.childNodes;
		for(var i = 0; i < childs.length; ++i)
		{
			var xmlnode = childs.item(i);
			if(xmlnode.nodeType != 1 ) //no tag
				continue;
			if(xmlnode.localName != nodename)
				continue;
			var node_id = xmlnode.getAttribute("id");
			if(node_id == id)
				return xmlnode;
		}
		return null;
	},

	readAnimations: function(root, scene)
	{
		var xmlanimations = root.querySelector("library_animations");
		if(!xmlanimations) return null;

		var xmlanimation_childs = xmlanimations.childNodes;

		var animations = {
			object_type: "Animation",
			takes: {}
		};

		var default_take = { tracks: [] };
		var tracks = default_take.tracks;

		for(var i = 0; i < xmlanimation_childs.length; ++i)
		{
			var xmlanimation = xmlanimation_childs.item(i);
			if(xmlanimation.nodeType != 1 ) //no tag
				continue;

			var anim_id = xmlanimation.getAttribute("id");

			xmlanimation = xmlanimation.querySelector("animation"); //yes... DAE has <animation> inside animation...
			if(!xmlanimation) continue;


			//channels are like animated properties
			var xmlchannel = xmlanimation.querySelector("channel");
			if(!xmlchannel) continue;

			var source = xmlchannel.getAttribute("source");
			var target = xmlchannel.getAttribute("target");

			//sampler, is in charge of the interpolation
			//var xmlsampler = xmlanimation.querySelector("sampler" + source);
			xmlsampler = this.findXMLNodeById(xmlanimation, "sampler", source.substr(1) );
			if(!xmlsampler)
			{
				console.error("Error DAE: Sampler not found in " + source);
				continue;
			}

			var inputs = {};
			var sources = {};
			var params = {};
			var xmlinputs = xmlsampler.querySelectorAll("input");

			var time_data = null;

			//iterate inputs
			for(var j = 0; j < xmlinputs.length; j++)
			{
				var xmlinput = xmlinputs.item(j);
				var source_name =  xmlinput.getAttribute("source");
				var semantic = xmlinput.getAttribute("semantic");

				//Search for source
				var xmlsource = this.findXMLNodeById( xmlanimation, "source", source_name.substr(1) );
				if(!xmlsource)
					continue;

				var xmlparam = xmlsource.querySelector("param");
				if(!xmlparam) continue;

				var type = xmlparam.getAttribute("type");
				inputs[ semantic ] = { source: source_name, type: type };

				var data_array = null;

				if(type == "float" || type == "float4x4")
				{
					var xmlfloatarray = xmlsource.querySelector("float_array");
					var floats = this.readContentAsFloats( xmlfloatarray );
					sources[ source_name ] = floats;
					data_array = floats;

				}
				else //only floats and matrices are supported in animation
					continue;

				var param_name = xmlparam.getAttribute("name");
				if(param_name == "TIME")
					time_data = data_array;
				params[ param_name || "OUTPUT" ] = type;
			}

			if(!time_data)
			{
				console.error("Error DAE: no TIME info found in animation: " + anim_id);
				continue;
			}

			//construct animation
			var path = target.split("/");

			var anim = {}
			anim.nodename = this.safeString( path[0] ); //where it goes
			anim.property = path[1];
			var node = this._nodes_by_id[ anim.nodename ];

			var element_size = 1;
			var param_type = params["OUTPUT"];
			switch(param_type)
			{
				case "float": element_size = 1; break;
				case "float3x3": element_size = 9; break;
				case "float4x4": element_size = 16; break;
				default: break;
			}

			anim.value_size = element_size;
			anim.duration = time_data[ time_data.length - 1]; //last sample

			var value_data = sources[ inputs["OUTPUT"].source ];
			if(!value_data) continue;

			//Pack data ****************
			var num_samples = time_data.length;
			var sample_size = element_size + 1;
			var anim_data = new Float32Array( num_samples * sample_size );
			//for every sample
			for(var j = 0; j < time_data.length; ++j)
			{
				anim_data[j * sample_size] = time_data[j]; //set time
				var value = value_data.subarray( j * element_size, (j+1) * element_size );
				if(param_type == "float4x4")
				{
					this.transformMatrix( value, node._depth == 0 );
					//mat4.transpose(value, value);
				}
				anim_data.set(value, j * sample_size + 1); //set data
			}

			if(isWorker && this.use_transferables)
			{
				var data = anim_data;
				if(data && data.buffer && data.length > 100)
					this._transferables.push(data.buffer);
			}

			anim.data = anim_data;
			tracks.push(anim);
		}

		if(!tracks.length) 
			return null; //empty animation

		animations.takes["default"] = default_take;
		return animations;
	},		

	findNode: function(root, id)
	{
		if(root.id == id) return root;
		if(root.children)
			for(var i in root.children)
			{
				var ret = this.findNode(root.children[i], id);
				if(ret) return ret;
			}
		return null;
	},

	//used for skinning and morphing
	readController: function(id, flip, scene)
	{
		//get root
		var xmlcontroller = this._xmlroot.querySelector("controller" + id);
		if(!xmlcontroller) return null;

		var use_indices = false;
		var xmlskin = xmlcontroller.querySelector("skin");
		if(xmlskin)
			return this.readSkinController(xmlskin, flip, scene);

		var xmlmorph = xmlcontroller.querySelector("morph");
		if(xmlmorph)
			return this.readMorphController(xmlmorph, flip, scene);

		return null;
	},

	//read this to more info about DAE and skinning https://collada.org/mediawiki/index.php/Skinning
	readSkinController: function(xmlskin, flip, scene)
	{
		//base geometry
		var id_geometry = xmlskin.getAttribute("source");
		var mesh = this.readGeometry( id_geometry, flip );
		if(!mesh)
			return null;

		var sources = this.readSources(xmlskin, flip);
		if(!sources)
			return null;

		//matrix
		var bind_matrix = null;
		var xmlbindmatrix = xmlskin.querySelector("bind_shape_matrix");
		if(xmlbindmatrix)
		{
			bind_matrix = this.readContentAsFloats( xmlbindmatrix );
			this.transformMatrix(bind_matrix, true, true );			
		}
		else
			bind_matrix = mat4.create(); //identity

		//joints
		var joints = [];
		var xmljoints = xmlskin.querySelector("joints");
		if(xmljoints)
		{
			var joints_source = null; //which bones
			var inv_bind_source = null; //bind matrices
			var xmlinputs = xmljoints.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				var xmlinput = xmlinputs[i];
				var sem = xmlinput.getAttribute("semantic").toUpperCase();
				var src = xmlinput.getAttribute("source");
				var source = sources[ src.substr(1) ];
				if(sem == "JOINT")
					joints_source = source;
				else if(sem == "INV_BIND_MATRIX")
					inv_bind_source = source;
			}

			//save bone names and inv matrix
			if(!inv_bind_source || !joints_source)
			{
				console.error("Error DAE: no joints or inv_bind sources found");
				return null;
			}

			for(var i in joints_source)
			{
				//get the inverse of the bind pose
				var inv_mat = inv_bind_source.subarray(i*16,i*16+16);
				var nodename = joints_source[i];
				var node = this._nodes_by_id[ nodename ];
				this.transformMatrix(inv_mat, node._depth == 0, true );
				joints.push([ nodename, inv_mat ]);
			}
		}

		//weights
		var xmlvertexweights = xmlskin.querySelector("vertex_weights");
		if(xmlvertexweights)
		{
			//here we see the order 
			var weights_indexed_array = null;
			var xmlinputs = xmlvertexweights.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				if( xmlinputs[i].getAttribute("semantic").toUpperCase() == "WEIGHT" )
					weights_indexed_array = sources[ xmlinputs.item(i).getAttribute("source").substr(1) ];
			}

			if(!weights_indexed_array)
				throw("no weights found");

			var xmlvcount = xmlvertexweights.querySelector("vcount");
			var vcount = this.readContentAsUInt32( xmlvcount );

			var xmlv = xmlvertexweights.querySelector("v");
			var v = this.readContentAsUInt32( xmlv );

			var num_vertices = mesh.vertices.length / 3; //3 components per vertex
			var weights_array = new Float32Array(4 * num_vertices); //4 bones per vertex
			var bone_index_array = new Uint8Array(4 * num_vertices); //4 bones per vertex

			var pos = 0;
			var remap = mesh._remap;
			var max_bone = 0; //max bone affected

			for(var i = 0; i < vcount.length; ++i)
			{
				var num_bones = vcount[i]; //num bones influencing this vertex

				//find 4 with more influence
				//var v_tuplets = v.subarray(offset, offset + num_bones*2);

				var offset = pos;
				var b = bone_index_array.subarray(i*4, i*4 + 4);
				var w = weights_array.subarray(i*4, i*4 + 4);

				var sum = 0;
				for(var j = 0; j < num_bones && j < 4; ++j)
				{
					b[j] = v[offset + j*2];
					if(b[j] > max_bone) max_bone = b[j];

					w[j] = weights_indexed_array[ v[offset + j*2 + 1] ];
					sum += w[j];
				}

				//normalize weights
				if(num_bones > 4 && sum < 1.0)
				{
					var inv_sum = 1/sum;
					for(var j = 0; j < 4; ++j)
						w[j] *= inv_sum;
				}

				pos += num_bones * 2;
			}


			//remap: because vertices order is now changed after parsing the mesh
			var final_weights = new Float32Array(4 * num_vertices); //4 bones per vertex
			var final_bone_indices = new Uint8Array(4 * num_vertices); //4 bones per vertex
			for(var i = 0; i < num_vertices; ++i)
			{
				var p = remap[ i ] * 4;
				var w = weights_array.subarray(p,p+4);
				var b = bone_index_array.subarray(p,p+4);

				//sort by weight so relevant ones goes first
				for(var k = 0; k < 3; ++k)
				{
					var max_pos = k;
					var max_value = w[k];
					for(var j = k+1; j < 4; ++j)
					{
						if(w[j] <= max_value)
							continue;
						max_pos = j;
						max_value = w[j];
					}
					if(max_pos != k)
					{
						var tmp = w[k];
						w[k] = w[max_pos];
						w[max_pos] = tmp;
						tmp = b[k];
						b[k] = b[max_pos];
						b[max_pos] = tmp;
					}
				}

				//store
				final_weights.set( w, i*4);
				final_bone_indices.set( b, i*4);
			}

			//console.log("Bones: ", joints.length, "Max bone: ", max_bone);
			if(max_bone >= joints.length)
				console.warning("Mesh uses higher bone index than bones found");

			mesh.weights = final_weights;
			mesh.bone_indices = final_bone_indices;
			mesh.bones = joints;
			mesh.bind_matrix = bind_matrix;
			delete mesh["_remap"];
		}

		return mesh;
	},

	readMorphController: function(xmlmorph, flip, scene)
	{
		var id_geometry = xmlmorph.getAttribute("source");
		var base_mesh = this.readGeometry( id_geometry, flip );
		if(!base_mesh)
			return null;

		//read sources with blend shapes info (which ones, and the weight)
		var sources = this.readSources(xmlmorph, flip);

		var morphs = [];

		//targets
		var xmltargets = xmlmorph.querySelector("targets");
		if(!xmltargets)
			return null;

		var xmlinputs = xmltargets.querySelectorAll("input");
		var targets = null;
		var weights = null;

		for(var i = 0; i < xmlinputs.length; i++)
		{
			var semantic = xmlinputs.item(i).getAttribute("semantic").toUpperCase();
			var data = sources[ xmlinputs.item(i).getAttribute("source").substr(1) ];
			if( semantic == "MORPH_TARGET" )
				targets = data;
			else if( semantic == "MORPH_WEIGHT" )
				weights = data;
		}

		if(!targets || !weights)
			return null;

		//get targets
		for(var i in targets)
		{
			var id = "#" + targets[i];
			var geometry = this.readGeometry( id, flip );
			scene.resources[id] = geometry;
			morphs.push([id, weights[i]]);
		}

		return { type: "morph", mesh: base_mesh, morph_targets: morphs };
	},

	readSources: function(xmlnode, flip)
	{
		//for data sources
		var sources = {};
		var xmlsources = xmlnode.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources.item(i);
			if(!xmlsource.querySelector) 
				continue;

			var float_array = xmlsource.querySelector("float_array");
			if(float_array)
			{
				var floats = this.readContentAsFloats( xmlsource );
				sources[ xmlsource.getAttribute("id") ] = floats;
				continue;
			}

			var name_array = xmlsource.querySelector("Name_array");
			if(name_array)
			{
				var names = this.readContentAsStringsArray( name_array );
				if(!names)
					continue;
				sources[ xmlsource.getAttribute("id") ] = names;
				continue;
			}
		}

		return sources;
	},

	readContentAsUInt32: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.trim(); //remove empty spaces
		if(text.length == 0) return null;
		var numbers = text.split(" "); //create array
		var floats = new Uint32Array( numbers.length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseInt( numbers[k] );
		return floats;
	},

	readContentAsFloats: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var numbers = text.split(" "); //create array
		var count = xmlnode.getAttribute("count");
		var length = count ? parseInt( count  ) : numbers.length;
		var floats = new Float32Array( length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseFloat( numbers[k] );
		return floats;
	},
	
	readContentAsStringsArray: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var words = text.split(" "); //create array
		for(var k = 0; k < words.length; k++)
			words[k] = words[k].trim();
		if(xmlnode.getAttribute("count") && parseInt(xmlnode.getAttribute("count")) != words.length)
		{
			var merged_words = [];
			var name = "";
			for (var i in words)
			{
				if(!name)
					name = words[i];
				else
					name += " " + words[i];
				if(!this._nodes_by_id[ this.safeString(name) ])
					continue;
				merged_words.push( this.safeString(name) );
				name = "";
			}

			var count = parseInt(xmlnode.getAttribute("count"));
			if(merged_words.length == count)
				return merged_words;

			console.error("Error: bone names have spaces, avoid using spaces in names");
			return null;
		}
		return words;
	},

	max3d_matrix_0: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),
	//max3d_matrix_other: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),

	transformMatrix: function(matrix, first_level, inverted)
	{
		mat4.transpose(matrix,matrix);

		if(this.no_flip)
			return matrix;

		//WARNING: DO NOT CHANGE THIS FUNCTION, THE SKY WILL FALL
		if(first_level){

			//flip row two and tree
			var temp = new Float32Array(matrix.subarray(4,8)); //swap rows
			matrix.set( matrix.subarray(8,12), 4 );
			matrix.set( temp, 8 );

			//reverse Z
			temp = matrix.subarray(8,12);
			vec4.scale(temp,temp,-1);
		}
		else 
		{
			var M = mat4.create();
			var m = matrix;

			//if(inverted) mat4.invert(m,m);

			/* non trasposed
			M.set([m[0],m[8],-m[4]], 0);
			M.set([m[2],m[10],-m[6]], 4);
			M.set([-m[1],-m[9],m[5]], 8);
			M.set([m[3],m[11],-m[7]], 12);
			*/

			M.set([m[0],m[2],-m[1]], 0);
			M.set([m[8],m[10],-m[9]], 4);
			M.set([-m[4],-m[6],m[5]], 8);
			M.set([m[12],m[14],-m[13]], 12);

			m.set(M);

			//if(inverted) mat4.invert(m,m);

		}
		return matrix;
	},

	debugMatrix: function(str, first_level )
	{
		var m = new Float32Array( JSON.parse("["+str.split(" ").join(",")+"]") );
		return this.transformMatrix(m, first_level );
	}
};


//add worker launcher
if(!isWorker)
{
	Collada.launchWorker = function()
	{
		var worker = this.worker = new Worker( Collada.workerPath + "collada.js" );
		worker.callback_ids = {};

		//main thread receives a message from worker
		worker.addEventListener('message', function(e) {
			if(!e.data)
				return;

			var data = e.data;

			switch(data.action)
			{
				case "log": console.log.apply( console, data.params ); break;
				case "error": console.error.apply( console, data.params ); break;
				case "result": 
					var callback = this.callback_ids[ data.callback_id ];
					if(!callback)
						throw("callback not found");
					callback( data.result );
					break;
				default:
					console.warn("Unknown action:", data.action);
					break;
			}
		});

		this.callback_ids = {};
		this.last_callback_id = 1;

		this.toWorker("init", [this.config] );
	}

	Collada.toWorker = function( func_name, params, callback )
	{
		if(!this.worker)
			this.launchWorker();

		var id = this.last_callback_id++;
		this.worker.callback_ids[ id ] = callback;
		this.worker.postMessage({ func: func_name, params: params, callback_id: id });
	}

	Collada.loadInWorker = function( url, callback )
	{
		this.toWorker("loadInWorker", [url], callback );
	}

	Collada.parseInWorker = function( data, callback )
	{
		this.toWorker("parseInWorker", [data], callback );
	}

}
else //in worker
{
	Collada.loadInWorker = function(callback, url) { 
		Collada.load(url, callback);
	}

	Collada.parseInWorker = function(callback, data) { 
		callback( Collada.parse(data) );
	}
}


function request(url, callback)
{
	var req = new XMLHttpRequest();
	req.onload = function() {
		var response = this.response;
		if(this.status != 200)
			return;
		if(callback)
			callback(this.response);
	};
	if(url.indexOf("://") == -1)
		url = Collada.dataPath + url;
	req.open("get", url, true);
	req.send();
}

//global event catcher
if(isWorker)
{
	self.addEventListener('message', function(e) {

		if(e.data.func == "init")
			return Collada.init.apply( Collada, e.data.params );

		var func_name = e.data.func;
		var params = e.data.params;
		var callback_id = e.data.callback_id;

		//callback when the work is done
		var callback = function(result){
			self.postMessage({action:"result", callback_id: callback_id, result: result}, Collada._transferables );
			Collada._transferables = null;
		}

		var func = Collada[func_name];

		if( func === "undefined")
		{
			console.error("function not found:", func_name);
			callback(null);
		}
		else
		{
			try
			{
				func.apply( Collada, params ? [callback].concat(params) : [callback]);
			}
			catch (err)
			{
				console.error("Error inside worker function call to " + func_name + " :: " + err);
				callback(null);
			}
		}

	}, false);
}

})( window || self );